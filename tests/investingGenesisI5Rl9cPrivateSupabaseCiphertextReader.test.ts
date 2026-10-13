import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createPrivateSupabaseCiphertextReaderV1,
} from '../workers/investing-blind-vault/privateSupabaseCiphertextReader.mjs';

const ref='b'.repeat(20);
const bucket='syntrake-private-test-ciphertext';
const key='sb_secret_'+'A'.repeat(22)+'_'+'B'.repeat(8);
const locator='C'.repeat(64);
const envelopeBytes=Buffer.from(JSON.stringify({
  schemaVersion:'BLIND_TRUTH_VAULT_ENVELOPE_V1',
  algorithm:'AES_256_GCM',
  keyVersion:'SYNTHETIC_V1',
  nonceHex:'A'.repeat(24),
  ciphertextBase64:Buffer.from('TEST_ONLY_FICTIONAL_ENCRYPTED_PAYLOAD','utf8').toString('base64'),
  tagHex:'B'.repeat(32),
})+'\n','utf8');
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex').toUpperCase();
const env={
  SYNTRAKE_VAULT_WORKER_MODE:'ISOLATED_SECRET_VAULT_V1',
  SYNTRAKE_VAULT_SYNTHETIC_STORE_MODE:'ISOLATED_REHEARSAL_V1',
};
const fields={privateObjectLocator:locator,expectedCiphertextSha256Hex:digest(envelopeBytes)};
const target=`https://${ref}.supabase.co/storage/v1/object/authenticated/${bucket}/sealed-v1/${locator}.json`;

function fixture(fn:(credFile:string,root:string)=>void|Promise<void>){
  const root=fs.mkdtempSync(path.join(homedir(),'.syntrake-rl9c-transport-test-'));
  fs.chmodSync(root,0o700);
  const credentialFilePath=path.join(root,'vault-credential');
  fs.writeFileSync(credentialFilePath,key,{mode:0o600});
  return Promise.resolve().then(()=>fn(credentialFilePath,root))
    .finally(()=>fs.rmSync(root,{recursive:true,force:true}));
}
function cfg(credentialFilePath:string,fetcher:(url:string,options:any)=>Promise<Response>){
  return {environment:env,vaultProjectRef:ref,privateBucket:bucket,credentialFilePath,fetcher};
}
const response=(status:number,body:Buffer=Buffer.alloc(0))=>
  new Response(new Uint8Array(body),{status});

describe.skipIf(process.platform!=='linux')('RL-9C private ciphertext-only Vault Storage transport — no holdout admission',()=>{
  it('reads only encrypted bytes from own Vault host with byte-level SHA-256 integrity',()=>fixture(async file=>{
    const sent:any[]=[];
    const reader=createPrivateSupabaseCiphertextReaderV1(cfg(file,async(url,options)=>{
      sent.push({url,options});
      return response(200,envelopeBytes);
    }));
    const bytes=await reader.readSealedObjectV1(fields);
    expect(bytes.equals(envelopeBytes)).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(target);
    expect(sent[0].options).toMatchObject({method:'GET',redirect:'manual',cache:'no-store'});
    expect(sent[0].options.headers).toEqual({
      apikey:key,accept:'application/octet-stream',
    });
    expect(sent[0].options.headers).not.toHaveProperty('authorization');
    expect(Object.keys(reader)).toEqual(['readSealedObjectV1']);
    expect(JSON.stringify(reader)).not.toContain(key);
  }));

  it('rejects syntactically unencrypted material, even if a caller supplies its exact SHA-256',()=>fixture(async file=>{
    const raw=Buffer.from('PLAINTEXT_IS_NOT_A_CIPHERTEXT_ENVELOPE\\n','utf8');
    const reader=createPrivateSupabaseCiphertextReaderV1(cfg(file,async()=>response(200,raw)));
    await expect(reader.readSealedObjectV1({
      privateObjectLocator:locator,
      expectedCiphertextSha256Hex:digest(raw),
    })).rejects.toThrow('VAULT_UNAVAILABLE');
    const invalid=Buffer.from(JSON.stringify({
      schemaVersion:'BLIND_TRUTH_VAULT_ENVELOPE_V1',
      algorithm:'AES_256_GCM',
      keyVersion:'SYNTHETIC_V1',
      nonceHex:'A'.repeat(24),
      ciphertextBase64:'bad base64',
      tagHex:'B'.repeat(32),
    })+'\\n','utf8');
    const badReader=createPrivateSupabaseCiphertextReaderV1(cfg(file,async()=>response(200,invalid)));
    await expect(badReader.readSealedObjectV1({
      privateObjectLocator:locator,
      expectedCiphertextSha256Hex:digest(invalid),
    })).rejects.toThrow('VAULT_UNAVAILABLE');
  }));

  it('HARD GATE: never routes injected HTTP or a Vault key outside synthetic rehearsal mode',()=>fixture(async file=>{
    let requests=0;
    const fake=async()=>{requests++;return response(200,envelopeBytes);};
    const cases=[
      {SYNTRAKE_VAULT_WORKER_MODE:'ISOLATED_SECRET_VAULT_V1'},
      {SYNTRAKE_VAULT_WORKER_MODE:'ISOLATED_SECRET_VAULT_V1',
       SYNTRAKE_VAULT_SYNTHETIC_STORE_MODE:'REAL_VAULT'},
      {SYNTRAKE_VAULT_WORKER_MODE:'ISOLATED_SECRET_VAULT_V1',
       SYNTRAKE_VAULT_SYNTHETIC_STORE_MODE:''},
    ];
    for(const environment of cases) {
      expect(()=>createPrivateSupabaseCiphertextReaderV1({
        ...cfg(file,fake),environment,
      })).toThrow('VAULT_UNAVAILABLE');
    }
    expect(requests).toBe(0);
  }));

  it('rejects wrong checksum, empty body, HTTP errors, redirect and server errors',()=>fixture(async file=>{
    for(const status of [301,302,400,401,403,404,429,500]){
      const reader=createPrivateSupabaseCiphertextReaderV1(cfg(file,async()=>response(status,envelopeBytes)));
      await expect(reader.readSealedObjectV1(fields)).rejects.toThrow('VAULT_UNAVAILABLE');
    }
    const reader=createPrivateSupabaseCiphertextReaderV1(cfg(file,async()=>response(200,envelopeBytes)));
    await expect(reader.readSealedObjectV1({...fields,expectedCiphertextSha256Hex:'F'.repeat(64)}))
      .rejects.toThrow('VAULT_UNAVAILABLE');
    const empty=createPrivateSupabaseCiphertextReaderV1(cfg(file,async()=>response(200)));
    await expect(empty.readSealedObjectV1(fields)).rejects.toThrow('VAULT_UNAVAILABLE');
    const oversize=createPrivateSupabaseCiphertextReaderV1(cfg(file,async()=>response(200,Buffer.alloc(8*1024*1024+1,0x41))));
    await expect(oversize.readSealedObjectV1(fields)).rejects.toThrow('VAULT_UNAVAILABLE');
  }));

  it('rejects network exceptions without leaking secrets',()=>fixture(async file=>{
    const reader=createPrivateSupabaseCiphertextReaderV1(cfg(file,async()=>{
      throw Error('upstream '+key);
    }));
    await expect(reader.readSealedObjectV1(fields)).rejects.toThrow('VAULT_UNAVAILABLE');
    await expect(reader.readSealedObjectV1(fields)).rejects.not.toThrow(key);
  }));

  it('never executes malicious getter, non-hex locator or unsigned extra parameter',()=>fixture(async file=>{
    let calls=0,reads=0;
    const reader=createPrivateSupabaseCiphertextReaderV1(cfg(file,async()=>{
      calls++;return response(200,envelopeBytes);
    }));
    const poisoned={...fields};
    Object.defineProperty(poisoned,'privateObjectLocator',{get(){reads++;throw Error('LEAK');},enumerable:true});
    for(const bad of [
      {...fields,privateObjectLocator:'../../secret'},
      {...fields,expectedCiphertextSha256Hex:'a'.repeat(64)},
      {...fields,privateObjectLocator:'foo'},
      {...fields,extra:'forged'},
      {...fields,[Symbol('authority')]:true},
      poisoned,
    ]) await expect(reader.readSealedObjectV1(bad)).rejects.toThrow('VAULT_UNAVAILABLE');
    expect(reads).toBe(0);
    expect(calls).toBe(0);
  }));

  it('rejects weak secret file, symlink, hardlink and loose directory',()=>fixture(async(file,root)=>{
    const run=async(p:string)=>createPrivateSupabaseCiphertextReaderV1(
      cfg(p,async()=>response(200,envelopeBytes)),
    ).readSealedObjectV1(fields);
    fs.chmodSync(file,0o644);
    await expect(run(file)).rejects.toThrow('VAULT_UNAVAILABLE');
    fs.chmodSync(file,0o600);
    const link=path.join(root,'symlink');
    fs.symlinkSync(file,link);
    await expect(run(link)).rejects.toThrow('VAULT_UNAVAILABLE');
    const hard=path.join(root,'hardlink');
    fs.linkSync(file,hard);
    await expect(run(file)).rejects.toThrow('VAULT_UNAVAILABLE');
    fs.unlinkSync(hard);
    fs.chmodSync(root,0o777);
    await expect(run(file)).rejects.toThrow('VAULT_UNAVAILABLE');
  }));

  it('rejects foreign credential formats and copied ordinary runtime secrets',()=>fixture(async(file,root)=>{
    const read=async()=>createPrivateSupabaseCiphertextReaderV1(
      cfg(file,async()=>response(200,envelopeBytes)),
    ).readSealedObjectV1(fields);
    fs.writeFileSync(file,'sb_publishable_'+'A'.repeat(22)+'_'+'B'.repeat(8));
    await expect(read()).rejects.toThrow('VAULT_UNAVAILABLE');
    fs.writeFileSync(file,key);
    const unauthorized={...cfg(file,async()=>response(200,envelopeBytes)),
      environment:{...env,SUPABASE_SERVICE_ROLE_KEY:'SYNTHETIC_BAD'}};
    expect(()=>createPrivateSupabaseCiphertextReaderV1(unauthorized))
      .toThrow('MISSING_VAULT_CAPABILITY');
    expect(()=>createPrivateSupabaseCiphertextReaderV1({...cfg(file,async()=>response(200,envelopeBytes)),vaultProjectRef:'wrong.example.com'}))
      .toThrow('VAULT_UNAVAILABLE');
    expect(()=>createPrivateSupabaseCiphertextReaderV1({...cfg(file,async()=>response(200,envelopeBytes)),privateBucket:'https://evil.invalid'}))
      .toThrow('VAULT_UNAVAILABLE');
    fs.unlinkSync(file);
    await expect(read()).rejects.toThrow('VAULT_UNAVAILABLE');
    expect(fs.existsSync(path.join(root,'vault-credential'))).toBe(false);
  }));

  it('blocks config accessors and never admits authorization based on an expected hash alone',()=>fixture(async file=>{
    const value=cfg(file,async()=>response(200,envelopeBytes));
    const getter={...value};
    let accessed=0;
    Object.defineProperty(getter,'credentialFilePath',{get(){accessed++;return file;},enumerable:true});
    expect(()=>createPrivateSupabaseCiphertextReaderV1(getter)).toThrow('VAULT_UNAVAILABLE');
    expect(accessed).toBe(0);
    expect(()=>createPrivateSupabaseCiphertextReaderV1({...value,authorization:'ALLOW'}))
      .toThrow('VAULT_UNAVAILABLE');
  }));
});
