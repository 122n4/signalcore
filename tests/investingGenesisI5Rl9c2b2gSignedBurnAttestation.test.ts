import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, createHash, sign } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createSyntheticPrivateCiphertextStoreV1 } from '../workers/investing-blind-vault/privateCiphertextStore.mjs';
import { encryptBlindTruthVaultEnvelopeV1 } from '../workers/investing-blind-vault/envelope';
import {
  syntheticBurnAttestationSigningBytesV1,
  createVerifiedSyntheticBurnConsumerV1,
} from '../workers/investing-blind-vault/privateSignedSyntheticBurnConsumer.mjs';

const mode='ISOLATED_REHEARSAL_V1';
const environment={
  SYNTRAKE_VAULT_WORKER_MODE:'ISOLATED_SECRET_VAULT_V1',
  SYNTRAKE_VAULT_SYNTHETIC_STORE_MODE:mode,
};
const fakeBytes=Buffer.from('FICTIONAL_SIGNATURE_BOUND_HOLDOUT_V1');
const binding={
  tenantId:'11111111-1111-4111-8111-111111111111',
  registrationHashHex:'A'.repeat(64),
  holdoutScopeDigestHex:'B'.repeat(64),
  commitmentHashHex:'C'.repeat(64),
};
function inRoot(fn:(root:string)=>void){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'syntrake-rl9-signed-attestation-'));
  fs.chmodSync(root,0o700);
  try{fn(root)}finally{fs.rmSync(root,{recursive:true,force:true});}
}
function scenario(root:string){
  const storeConfig={environment,rootDirectory:root,storageMode:mode};
  const staged=createSyntheticPrivateCiphertextStoreV1(storeConfig).stageSyntheticEnvelopeV1({
    classification:'SYNTHETIC_TEST_VECTOR',
    envelope:encryptBlindTruthVaultEnvelopeV1({
      vaultEncryptionKey:Buffer.alloc(32,0x42),
      keyVersion:'SYNTHETIC_K1',
      binding,exactCanonicalPlaintextBytes:fakeBytes,
    }),
  });
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const der=publicKey.export({format:'der',type:'spki'}) as Buffer;
  const fingerprint=createHash('sha256').update(der).digest('hex').toUpperCase();
  const claims={
    schemaVersion:'RL9_SYNTHETIC_COMMITTED_BURN_ATTESTATION_V1',
    audience:'ISOLATED_VAULT_SYNTHETIC_TEST_ONLY',
    tenantId:binding.tenantId,
    registrationHashHex:binding.registrationHashHex,
    evaluationHashHex:'D'.repeat(64),
    revealStartedEventHashHex:'E'.repeat(64),
    burnReservationId:'77777777-7777-4777-8777-777777777777',
    burnState:'BURNED_NOT_AUTHORIZED',
    privateObjectLocator:staged.privateObjectLocator,
    issuedAtMs:Date.now()-1000,
    expiresAtMs:Date.now()+30000,
  };
  const tokenFor=(claim=claims,key=privateKey)=>({
    claims:claim,
    signatureBase64:sign(null,syntheticBurnAttestationSigningBytesV1(claim),key).toString('base64'),
  });
  const config={
    syntheticStoreConfig:storeConfig,
    trustedSignerPublicKeyDer:der,
    trustedSignerPublicKeySha256Hex:fingerprint,
  };
  return {claims,config,tokenFor,privateKey};
}

describe.skipIf(process.platform==='win32')('RL-9C2B2G pinned signed synthetic committed-burn fixture bridge',()=>{
  it('requires exact pinned Ed25519 attestation before encrypted read and burns once',()=>inRoot(root=>{
    const f=scenario(root);
    const worker=createVerifiedSyntheticBurnConsumerV1(f.config);
    const signed=f.tokenFor();
    const first=worker.consumeSignedSyntheticBurnOnceV1(signed);
    expect(first.status).toBe('SYNTHETIC_CONSUMED_ONCE');
    expect(first.envelope.algorithm).toBe('AES_256_GCM');
    expect(JSON.stringify(first)).not.toContain(fakeBytes.toString('utf8'));
    expect(JSON.stringify(first)).not.toContain(f.claims.burnReservationId);
    expect(()=>createVerifiedSyntheticBurnConsumerV1(f.config)
      .consumeSignedSyntheticBurnOnceV1(signed)).toThrow('VAULT_UNAVAILABLE');
  }));

  it('rejects forged caller changes to tenant, event, reservation, object locator and scope',()=>inRoot(root=>{
    const f=scenario(root),worker=createVerifiedSyntheticBurnConsumerV1(f.config);
    const original=f.tokenFor();
    const mutations=[
      {tenantId:'22222222-2222-4222-8222-222222222222'},
      {registrationHashHex:'F'.repeat(64)},
      {evaluationHashHex:'F'.repeat(64)},
      {revealStartedEventHashHex:'F'.repeat(64)},
      {burnReservationId:'66666666-6666-4666-8666-666666666666'},
      {privateObjectLocator:'F'.repeat(64)},
      {burnState:'COMMITTED_AUTHORIZED'},
      {audience:'REAL_VAULT'},
    ];
    for(const update of mutations)expect(()=>
      worker.consumeSignedSyntheticBurnOnceV1({
        ...original,claims:{...f.claims,...update},
      })).toThrow('AUTHORITY_FAILURE');
    expect(fs.readdirSync(path.join(root,'synthetic-evaluation-claims')))
      .toHaveLength(0);
  }));

  it('rejects unsigned, wrong-key, truncated and noncanonical signatures',()=>inRoot(root=>{
    const f=scenario(root),worker=createVerifiedSyntheticBurnConsumerV1(f.config);
    const another=generateKeyPairSync('ed25519');
    const wrong=f.tokenFor(f.claims,another.privateKey);
    for(const t of [
      {claims:f.claims,signatureBase64:''},
      {claims:f.claims,signatureBase64:'bad'},
      {...wrong},
      {claims:f.claims,signatureBase64:'A'.repeat(86)+'=='},
      {claims:f.claims,signatureBase64:f.tokenFor().signatureBase64.replace(/=$/u,'A')},
    ])expect(()=>worker.consumeSignedSyntheticBurnOnceV1(t))
      .toThrow('AUTHORITY_FAILURE');
  }));

  it('rejects expired, future-dated and overly broad synthetic grants even when correctly signed',()=>inRoot(root=>{
    const f=scenario(root),worker=createVerifiedSyntheticBurnConsumerV1(f.config);
    const now=Date.now();
    for(const delta of [
      {issuedAtMs:now-61000,expiresAtMs:now-1},
      {issuedAtMs:now+10000,expiresAtMs:now+20000},
      {issuedAtMs:now-1000,expiresAtMs:now+120000},
      {issuedAtMs:0,expiresAtMs:0},
    ]){
      const c={...f.claims,...delta};
      expect(()=>worker.consumeSignedSyntheticBurnOnceV1(f.tokenFor(c)))
        .toThrow('AUTHORITY_FAILURE');
    }
  }));

  it('rejects weak keys, wrong pin, non-Ed25519 algorithm and copied app secrets',()=>inRoot(root=>{
    const f=scenario(root);
    for(const bad of [
      {...f.config,trustedSignerPublicKeySha256Hex:'F'.repeat(64)},
      {...f.config,trustedSignerPublicKeyDer:Buffer.from('malformed')},
      {...f.config,trustedSignerPublicKeyDer:Buffer.alloc(64)},
      {...f.config,syntheticStoreConfig:{
        ...f.config.syntheticStoreConfig,
        environment:{...environment,SUPABASE_SERVICE_ROLE_KEY:'ordinary-test'},
      }},
    ])expect(()=>createVerifiedSyntheticBurnConsumerV1(bad)).toThrow();
    const rsa=generateKeyPairSync('rsa',{modulusLength:2048}).publicKey
      .export({format:'der',type:'spki'}) as Buffer;
    expect(()=>createVerifiedSyntheticBurnConsumerV1({
      ...f.config,trustedSignerPublicKeyDer:rsa,
      trustedSignerPublicKeySha256Hex:createHash('sha256').update(rsa)
        .digest('hex').toUpperCase(),
    })).toThrow('AUTHORITY_FAILURE');
  }));

  it('does not execute malicious claim getters, prototypes, symbols or unsigned extra fields',()=>inRoot(root=>{
    const f=scenario(root),worker=createVerifiedSyntheticBurnConsumerV1(f.config);
    let getterReads=0;
    const forged={...f.claims};
    Object.defineProperty(forged,'tenantId',{enumerable:true,get(){
      getterReads++;throw Error('PRIVATE_SECRET_IN_GETTER');
    }});
    expect(()=>worker.consumeSignedSyntheticBurnOnceV1({
      claims:forged,signatureBase64:f.tokenFor().signatureBase64,
    })).toThrow('AUTHORITY_FAILURE');
    expect(getterReads).toBe(0);
    for(const token of [
      {claims:Object.assign(Object.create({authorized:true}),f.claims),
        signatureBase64:f.tokenFor().signatureBase64},
      {claims:{...f.claims,[Symbol('authority')]:true},
        signatureBase64:f.tokenFor().signatureBase64},
      {...f.tokenFor(),signedAsAdmin:true},
    ])expect(()=>worker.consumeSignedSyntheticBurnOnceV1(token))
      .toThrow('AUTHORITY_FAILURE');
  }));

  it('keeps public mTLS server and ordinary Research free of this private synthetic consume route',()=>inRoot(root=>{
    const f=scenario(root);
    expect(Object.keys(createVerifiedSyntheticBurnConsumerV1(f.config)))
      .toEqual(['consumeSignedSyntheticBurnOnceV1']);
    const server=fs.readFileSync(path.join(process.cwd(),
      'workers/investing-blind-vault/isolatedServer.mjs'),'utf8');
    expect(server).not.toContain('privateSignedSyntheticBurnConsumer');
    expect(server).not.toContain('consumeSignedSyntheticBurnOnceV1');
    const research=fs.readFileSync(path.join(process.cwd(),
      'lib/investing/research/researchExecutionService.ts'),'utf8');
    expect(research).not.toContain('privateSignedSyntheticBurnConsumer');
  }));
});
