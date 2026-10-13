import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  createSignedSyntheticRemoteVaultConsumerV1,
  syntheticRemoteBurnSigningBytesV1,
} from '../workers/investing-blind-vault/privateSignedSyntheticRemoteConsume.mjs';

const mode='ISOLATED_REHEARSAL_V1';
const env={
  SYNTRAKE_VAULT_WORKER_MODE:'ISOLATED_SECRET_VAULT_V1',
  SYNTRAKE_VAULT_SYNTHETIC_STORE_MODE:mode,
};
const secret='sb_secret_'+'A'.repeat(22)+'_'+'B'.repeat(8);
const ref='b'.repeat(20), bucket='private-fixture-ciphertext';
const locator='C'.repeat(64);
const envelope=Buffer.from(JSON.stringify({
  schemaVersion:'BLIND_TRUTH_VAULT_ENVELOPE_V1',
  algorithm:'AES_256_GCM',keyVersion:'SYNTHETIC_TEST_K1',
  nonceHex:'D'.repeat(24),tagHex:'E'.repeat(32),
  ciphertextBase64:Buffer.from('SYNTHETIC_AES_GCM_CIPHERTEXT_NO_SECRET').toString('base64'),
})+'\n','utf8');
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex').toUpperCase();
const res=(status:number,bytes:Buffer=envelope)=>new Response(new Uint8Array(bytes),{status});
const expectedPath=`https://${ref}.supabase.co/storage/v1/object/authenticated/${bucket}/sealed-v1/${locator}.json`;

async function fixture(run:(f:ReturnType<typeof build>)=>Promise<void>|void){
  const root=fs.mkdtempSync(path.join(homedir(),'.syntrake-rl9c-signed-remote-fixture-'));
  fs.chmodSync(root,0o700);
  const credentialFilePath=path.join(root,'vault-credential.txt');
  fs.writeFileSync(credentialFilePath,secret,{mode:0o600});
  try{await run(build(root,credentialFilePath));}
  finally{fs.rmSync(root,{recursive:true,force:true});}
}
function build(root:string,credentialFilePath:string){
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const der=publicKey.export({format:'der',type:'spki'}) as Buffer;
  const calls:{url:string;headers:Record<string,string>}[]=[];
  let upstreamStatus=200,upstreamBytes=envelope;
  const transportConfig={
    environment:env,vaultProjectRef:ref,privateBucket:bucket,credentialFilePath,
    fetcher:async(url:string,opts:any)=>{
      calls.push({url,headers:opts.headers});
      return res(upstreamStatus,upstreamBytes);
    },
  };
  const config={
    environment:env,storageMode:mode,rootDirectory:root,
    trustedSignerPublicKeyDer:der,
    trustedSignerPublicKeySha256Hex:hash(der),
    transportConfig,
  };
  const claims={
    schemaVersion:'RL9_SYNTHETIC_REMOTE_COMMITTED_BURN_V1',
    audience:'ISOLATED_VAULT_SYNTHETIC_REMOTE_TEST_ONLY',
    tenantId:'11111111-1111-4111-8111-111111111111',
    registrationHashHex:'A'.repeat(64),
    evaluationHashHex:'B'.repeat(64),
    revealStartedEventHashHex:'D'.repeat(64),
    burnReservationId:'77777777-7777-4777-8777-777777777777',
    burnState:'BURNED_NOT_AUTHORIZED',
    privateObjectLocator:locator,
    expectedCiphertextSha256Hex:hash(envelope),
    issuedAtMs:Date.now()-1000,
    expiresAtMs:Date.now()+30_000,
  };
  const token=(data:Record<string,any>=claims,key=privateKey)=>({
    claims:data,
    signatureBase64:sign(null,syntheticRemoteBurnSigningBytesV1(data),key).toString('base64'),
  });
  return {
    root,config,claims,calls,token,
    setResponse(status:number,body:Buffer=envelope){upstreamStatus=status;upstreamBytes=body;},
  };
}

describe.skipIf(process.platform!=='linux')('RL-9C signed synthetic remote consumption — durable burn before ciphertext HTTP',()=>{
  it('requires signed fixture identity, burns once before Vault-host-only encrypted read',()=>fixture(async f=>{
    const worker=createSignedSyntheticRemoteVaultConsumerV1(f.config);
    const result=await worker.consumeSignedSyntheticRemoteEnvelopeOnceV1(f.token());
    expect(result.status).toBe('SYNTHETIC_REMOTE_CONSUMED_ONCE');
    expect(result.encryptedEnvelopeBytes.equals(envelope)).toBe(true);
    expect(f.calls).toEqual([{url:expectedPath,headers:{apikey:secret,accept:'application/octet-stream'}}]);
    expect(fs.readdirSync(path.join(f.root,'remote-evaluation-burns'))).toHaveLength(1);
    expect(fs.readdirSync(path.join(f.root,'remote-object-burns'))).toHaveLength(1);
    expect(()=>JSON.stringify(result).includes(secret)).not.toThrow();
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain('PLAINTEXT_HOLDOUT');
    await expect(createSignedSyntheticRemoteVaultConsumerV1(f.config)
      .consumeSignedSyntheticRemoteEnvelopeOnceV1(f.token())).rejects.toThrow('VAULT_UNAVAILABLE');
    expect(f.calls).toHaveLength(1);
  }));

  it('concurrent double submit results in exactly one remote read',()=>fixture(async f=>{
    const consumer=createSignedSyntheticRemoteVaultConsumerV1(f.config);
    const t=f.token();
    const results=await Promise.allSettled([
      consumer.consumeSignedSyntheticRemoteEnvelopeOnceV1(t),
      consumer.consumeSignedSyntheticRemoteEnvelopeOnceV1(t),
    ]);
    expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(x=>x.status==='rejected')).toHaveLength(1);
    expect(f.calls).toHaveLength(1);
  }));

  it('burns irrevocably BEFORE a remote 403 or checksum failure; no retry',()=>fixture(async f=>{
    f.setResponse(403);
    const reader=createSignedSyntheticRemoteVaultConsumerV1(f.config);
    const t=f.token();
    await expect(reader.consumeSignedSyntheticRemoteEnvelopeOnceV1(t))
      .rejects.toThrow('VAULT_UNAVAILABLE');
    f.setResponse(200);
    await expect(reader.consumeSignedSyntheticRemoteEnvelopeOnceV1(t))
      .rejects.toThrow('VAULT_UNAVAILABLE');
    expect(f.calls).toHaveLength(1);
  }));

  it('a successful commit-looking fixture claim without a valid signature cannot cause any burn/read',()=>fixture(async f=>{
    const consumer=createSignedSyntheticRemoteVaultConsumerV1(f.config);
    const valid=f.token();
    const variants=[
      {...valid,claims:{...f.claims,privateObjectLocator:'F'.repeat(64)}},
      {...valid,claims:{...f.claims,expectedCiphertextSha256Hex:'F'.repeat(64)}},
      {...valid,claims:{...f.claims,burnReservationId:'66666666-6666-4666-8666-666666666666'}},
      {...valid,claims:{...f.claims,tenantId:'22222222-2222-4222-8222-222222222222'}},
      {...valid,claims:{...f.claims,audience:'ISOLATED_VAULT_REAL'}},
      {...valid,signatureBase64:'A'.repeat(86)+'=='},
      {...valid,signatureBase64:''},
    ];
    for(const t of variants){
      await expect(consumer.consumeSignedSyntheticRemoteEnvelopeOnceV1(t))
        .rejects.toThrow('VAULT_UNAVAILABLE');
    }
    expect(f.calls).toHaveLength(0);
    expect(fs.readdirSync(path.join(f.root,'remote-evaluation-burns'))).toHaveLength(0);
  }));

  it('different evaluations cannot reuse the same ciphertext locator',()=>fixture(async f=>{
    const worker=createSignedSyntheticRemoteVaultConsumerV1(f.config);
    await worker.consumeSignedSyntheticRemoteEnvelopeOnceV1(f.token());
    const other=f.token({...f.claims,evaluationHashHex:'F'.repeat(64)});
    await expect(worker.consumeSignedSyntheticRemoteEnvelopeOnceV1(other))
      .rejects.toThrow('VAULT_UNAVAILABLE');
    expect(f.calls).toHaveLength(1);
    expect(fs.readdirSync(path.join(f.root,'remote-evaluation-burns'))).toHaveLength(2);
    expect(fs.readdirSync(path.join(f.root,'remote-object-burns'))).toHaveLength(1);
  }));

  it('rejects weak FS permissions, forged config or ordinary app process environment',()=>fixture(async f=>{
    fs.chmodSync(f.root,0o777);
    expect(()=>createSignedSyntheticRemoteVaultConsumerV1(f.config))
      .toThrow('VAULT_UNAVAILABLE');
    fs.chmodSync(f.root,0o700);
    expect(()=>createSignedSyntheticRemoteVaultConsumerV1({
      ...f.config,storageMode:'REAL_VAULT',
    })).toThrow('VAULT_UNAVAILABLE');
    expect(()=>createSignedSyntheticRemoteVaultConsumerV1({
      ...f.config,environment:{...env,SUPABASE_SERVICE_ROLE_KEY:'ordinary'},
    })).toThrow('MISSING_VAULT_CAPABILITY');
    expect(()=>createSignedSyntheticRemoteVaultConsumerV1({
      ...f.config,exposeToApp:true,
    })).toThrow('VAULT_UNAVAILABLE');
  }));

  it('does not route the synthetic consumer through any public mTLS or Investing service',()=>fixture(async f=>{
    expect(Object.keys(createSignedSyntheticRemoteVaultConsumerV1(f.config)))
      .toEqual(['consumeSignedSyntheticRemoteEnvelopeOnceV1']);
    const server=fs.readFileSync(path.join(process.cwd(),'workers/investing-blind-vault/isolatedServer.mjs'),'utf8');
    const app=fs.readFileSync(path.join(process.cwd(),'lib/investing/research/researchExecutionService.ts'),'utf8');
    expect(server).not.toContain('privateSignedSyntheticRemoteConsume');
    expect(app).not.toContain('privateSignedSyntheticRemoteConsume');
  }));
});
