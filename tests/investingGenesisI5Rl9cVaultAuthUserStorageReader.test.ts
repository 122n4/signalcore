import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPrivateVaultAuthUserStorageReaderV1 } from '../workers/investing-blind-vault/privateVaultAuthUserStorageReader.mjs';

const vault='b'.repeat(20);
const pub='sb_publishable_'+'A'.repeat(22)+'_'+'B'.repeat(8);
const locator='C'.repeat(64);
const now=()=>Math.floor(Date.now()/1000);
const envelope=Buffer.from(JSON.stringify({
  schemaVersion:'BLIND_TRUTH_VAULT_ENVELOPE_V1',
  algorithm:'AES_256_GCM',keyVersion:'SYNTHETIC_K1',
  nonceHex:'D'.repeat(24),tagHex:'E'.repeat(32),
  ciphertextBase64:Buffer.from('ENCRYPTED_SYNTHETIC_TEST_VECTOR').toString('base64'),
})+'\n','utf8');
const sha=(body:Buffer)=>createHash('sha256').update(body).digest('hex').toUpperCase();
const target={privateObjectLocator:locator,expectedCiphertextSha256Hex:sha(envelope)};
const url=`https://${vault}.supabase.co/storage/v1/object/authenticated/vault-private-test/sealed-v1/${locator}.json`;
const env={SYNTRAKE_VAULT_WORKER_MODE:'ISOLATED_SECRET_VAULT_V1',
  SYNTRAKE_VAULT_READER_MODE:'VAULT_AUTH_USER_JWT_V1'};
const encode=(v:object)=>Buffer.from(JSON.stringify(v)).toString('base64url');
function jwt(overrides:Record<string,unknown>={}){
  const claims={
    iss:`https://${vault}.supabase.co/auth/v1`,aud:'authenticated',
    role:'authenticated',sub:'11111111-1111-4111-8111-111111111111',
    iat:now()-60,exp:now()+600,...overrides,
  };
  return encode({typ:'JWT',alg:'HS256'})+'.'+encode(claims)+'.'+Buffer.alloc(32,1).toString('base64url');
}
async function fixture(f:(a:{dir:string;credential:string;config:any})=>Promise<void>){
  const dir=fs.mkdtempSync(path.join(homedir(),'.rl9c-auth-storage-test-'));
  fs.chmodSync(dir,0o700);
  const credential=path.join(dir,'vault-auth-jwt');
  fs.writeFileSync(credential,jwt(),{mode:0o600});
  const config={environment:env,vaultProjectRef:vault,privateBucket:'vault-private-test',
    publishableKey:pub,authUserJwtFilePath:credential};
  try{await f({dir,credential,config});}
  finally{fs.rmSync(dir,{force:true,recursive:true});}
}
async function mockFetch(f:(calls:any[])=>Promise<void>){
  const original=globalThis.fetch;
  const calls:any[]=[];
  globalThis.fetch=async (input:any,init:any)=>{
    calls.push({input,init});
    return new Response(new Uint8Array(envelope),{status:200});
  };
  try{await f(calls);}finally{globalThis.fetch=original;}
}

describe.skipIf(process.platform!=='linux')('RL-9C real Vault Auth user HTTP contract — provider must authorize JWT+RLS',()=>{
  it('uses Vault publishable api key plus OWN Vault Auth JWT only on exact private object host',()=>fixture(async ({config})=>{
    await mockFetch(async calls=>{
      const reader=createPrivateVaultAuthUserStorageReaderV1(config);
      const bytes=await reader.readSealedObjectV1(target);
      expect(bytes.equals(envelope)).toBe(true);
      expect(calls).toHaveLength(1);
      expect(calls[0].input).toBe(url);
      expect(calls[0].init).toMatchObject({method:'GET',cache:'no-store',redirect:'manual'});
      expect(calls[0].init.headers.apikey).toBe(pub);
      expect(calls[0].init.headers.authorization).toMatch(/^Bearer eyJ/u);
      expect(calls[0].init.headers.authorization).not.toContain('sb_secret_');
      expect(JSON.stringify(reader)).not.toContain(calls[0].init.headers.authorization);
    });
  }));
  it('rejects wrong-project issuer, privileged JWT roles, stale JWT, bad audience and malformed token before egress',()=>fixture(async ({config,credential})=>{
    let calls=0;
    const old=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('should not call');};
    try{
      for(const value of [
        jwt({iss:'https://wrong-project.supabase.co/auth/v1'}),
        jwt({role:'service_role'}),
        jwt({aud:'anon'}),jwt({exp:now()-10}),jwt({exp:now()+86401}),
        jwt({sub:'not-uuid'}),jwt({nbf:now()+600}),
        jwt({iat:now()+60}),
        'sb_secret_'+'Q'.repeat(80),
        encode({alg:'none'})+'.'+encode({})+'.'+Buffer.alloc(32,1).toString('base64url'),
      ]){
        fs.writeFileSync(credential,value);
        await expect(createPrivateVaultAuthUserStorageReaderV1(config)
          .readSealedObjectV1(target)).rejects.toThrow('VAULT_UNAVAILABLE');
      }
      expect(calls).toBe(0);
    }finally{globalThis.fetch=old;}
  }));
  it('blocks HTTP 400, 401, 403, redirects, wrong ciphertext hash and plaintext even if hash matches',()=>fixture(async ({config})=>{
    const old=globalThis.fetch;let calls=0;
    try{
      for(const status of [302,400,401,403,404,429,500]){
        globalThis.fetch=async()=>{calls++;return new Response('blocked',{status});};
        await expect(createPrivateVaultAuthUserStorageReaderV1(config)
          .readSealedObjectV1(target)).rejects.toThrow('VAULT_UNAVAILABLE');
      }
      globalThis.fetch=async()=>new Response(new Uint8Array(envelope),{status:200});
      await expect(createPrivateVaultAuthUserStorageReaderV1(config)
        .readSealedObjectV1({...target,expectedCiphertextSha256Hex:'F'.repeat(64)}))
        .rejects.toThrow('VAULT_UNAVAILABLE');
      const plaintext=Buffer.from('NOT_CIPHERTEXT\n');
      globalThis.fetch=async()=>new Response(new Uint8Array(plaintext),{status:200});
      await expect(createPrivateVaultAuthUserStorageReaderV1(config)
        .readSealedObjectV1({...target,expectedCiphertextSha256Hex:sha(plaintext)}))
        .rejects.toThrow('VAULT_UNAVAILABLE');
      expect(calls).toBe(7);
    }finally{globalThis.fetch=old;}
  }));
  it('fails before egress for symlinks, world-readable JWT, hardlinks and weak directory',()=>fixture(async ({config,credential,dir})=>{
    let calls=0;const old=globalThis.fetch;
    globalThis.fetch=async()=>{calls++;throw Error('unexpected egress');};
    try{
      fs.chmodSync(credential,0o644);
      await expect(createPrivateVaultAuthUserStorageReaderV1(config)
        .readSealedObjectV1(target)).rejects.toThrow('VAULT_UNAVAILABLE');
      fs.chmodSync(credential,0o600);
      const alias=path.join(dir,'link');fs.symlinkSync(credential,alias);
      await expect(createPrivateVaultAuthUserStorageReaderV1({
        ...config,authUserJwtFilePath:alias,
      }).readSealedObjectV1(target)).rejects.toThrow('VAULT_UNAVAILABLE');
      const hard=path.join(dir,'hard');fs.linkSync(credential,hard);
      await expect(createPrivateVaultAuthUserStorageReaderV1(config)
        .readSealedObjectV1(target)).rejects.toThrow('VAULT_UNAVAILABLE');
      fs.unlinkSync(hard);
      fs.chmodSync(dir,0o777);
      await expect(createPrivateVaultAuthUserStorageReaderV1(config)
        .readSealedObjectV1(target)).rejects.toThrow('VAULT_UNAVAILABLE');
      expect(calls).toBe(0);
    }finally{globalThis.fetch=old;}
  }));
  it('rejects foreign hosts, service_role keys, caller-controlled fetcher and forged getter',()=>fixture(async ({config})=>{
    for(const bad of [
      {...config,vaultProjectRef:'attacker.example'},
      {...config,publishableKey:'sb_secret_'+'A'.repeat(22)+'_'+'B'.repeat(8)},
      {...config,fetcher:async()=>null},
      {...config,privateBucket:'https://evil.example'},
      {...config,environment:{SYNTRAKE_VAULT_WORKER_MODE:'ISOLATED_SECRET_VAULT_V1'}},
    ]){
      expect(()=>createPrivateVaultAuthUserStorageReaderV1(bad)).toThrow('VAULT_UNAVAILABLE');
    }
    let reads=0;const poisoned={...config};
    Object.defineProperty(poisoned,'publishableKey',{enumerable:true,get(){reads++;return pub;}});
    expect(()=>createPrivateVaultAuthUserStorageReaderV1(poisoned)).toThrow('VAULT_UNAVAILABLE');
    expect(reads).toBe(0);
    const reader=createPrivateVaultAuthUserStorageReaderV1(config);
    await expect(reader.readSealedObjectV1({...target,privateObjectLocator:'../../evil'}))
      .rejects.toThrow('VAULT_UNAVAILABLE');
  }));
});
