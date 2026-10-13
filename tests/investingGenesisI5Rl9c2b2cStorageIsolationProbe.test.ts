import { describe, it, expect } from 'vitest';
import { chmodSync, linkSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  canarySubjectDigest, proveCanaryPhase, readPrivateMount,
  validateCanaryConfig, SYNTHETIC_MARKER,
} from '../scripts/investing/rl9c2b2cStorageIsolationProbe.mjs';

const primary='a'.repeat(20), vault='b'.repeat(20);
const config={
  primaryProjectRef:primary,vaultProjectRef:vault,
  bucket:'vault-private-canary',
  objectPath:'rl9c2b2c-isolation-canary-v1/'+'c'.repeat(32)+'.txt',
};
const secret='sb_secret_'+'A'.repeat(22)+'_'+'B'.repeat(8);
const publicKey='sb_publishable_'+'C'.repeat(22)+'_'+'D'.repeat(8);
const primaryBucket=`https://${primary}.supabase.co/storage/v1/bucket`;
const vaultCanary=`https://${vault}.supabase.co/storage/v1/object/authenticated/vault-private-canary/${config.objectPath}`;
const vaultSettings=`https://${vault}.supabase.co/auth/v1/settings`;
const response=(status:number,body='')=>new Response(body,{status});

describe('RL-9C2B2C credential host confinement: offline only, never foreign secret transmission',()=>{
  it('passes Vault-owned positive canary bytes using only Vault host',async()=>{
    const seen:any[]=[];
    const report=await proveCanaryPhase({phase:'VAULT_POSITIVE',config,credential:secret,fetcher:async(url:string,opts:any)=>{
      seen.push({url,headers:opts.headers,redirect:opts.redirect});
      return response(200,SYNTHETIC_MARKER);
    }});
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe(vaultCanary);
    expect(seen[0].headers.apikey).toBe(secret);
    expect(seen[0].headers).not.toHaveProperty('authorization');
    expect(seen[0].redirect).toBe('manual');
    expect(report).toEqual({
      kind:'SYNTRAKE_RL9C2B2C_ISOLATION_CANARY_V1',
      phase:'VAULT_POSITIVE',status:'PASS',
      subjectDigest:canarySubjectDigest(config),
      evidence:'PRIVATE_CANARY_CONFIRMED',
    });
    expect(JSON.stringify(report)).not.toContain(secret);
    expect(JSON.stringify(report)).not.toContain(config.objectPath);
  });

  it('validates PRIMARY secret on PRIMARY own host only, with no Vault call',async()=>{
    const seen:any[]=[];
    const report=await proveCanaryPhase({phase:'PRIMARY_SELF_CONTROL',config,credential:secret,fetcher:async(url:string,opts:any)=>{
      seen.push({url,headers:opts.headers,redirect:opts.redirect,cache:opts.cache});
      return response(200,'[]');
    }});
    expect(seen).toEqual([{
      url:primaryBucket,headers:{accept:'application/json',apikey:secret},
      redirect:'manual',cache:'no-store',
    }]);
    expect(report.phase).toBe('PRIMARY_SELF_CONTROL');
    expect(report.status).toBe('PASS');
    expect(report.evidence).toBe('PRIMARY_KEY_VALID_ON_OWN_PROJECT_ONLY');
    expect(report.subjectDigest).toBe(canarySubjectDigest(config));
    expect(JSON.stringify(report)).not.toContain(secret);
  });

  it('blocks both revoked cross-project phases BEFORE issuing any HTTP request',async()=>{
    const phases=['PRIMARY_DENIAL','PRIMARY_KEY_GATEWAY_DENIAL'];
    for(const phase of phases){
      let calls=0;
      await expect(proveCanaryPhase({phase,config,credential:secret,fetcher:async()=>{
        calls++;return response(200,SYNTHETIC_MARKER);
      }})).rejects.toThrow('RL9C2B2C_BLOCKED');
      expect(calls).toBe(0);
    }
  });

  it('never upgrades PRIMARY positive control into a Vault isolation assertion',async()=>{
    let calls=0;
    for(const status of [401,403,404,400,200,500,302]){
      await expect(proveCanaryPhase({
        phase:'PRIMARY_SELF_CONTROL',config,credential:secret,
        fetcher:async(url:string)=>{
          expect(url).toBe(primaryBucket);
          calls++;return response(status);
        },
      })).then(report=>{
        if(status===200){
          expect(report.evidence).toBe('PRIMARY_KEY_VALID_ON_OWN_PROJECT_ONLY');
          expect(report.evidence).not.toMatch(/VAULT|DENIAL|ISOLATION/);
        }else{throw Error('unexpected PASS');}
      },error=>{
        if(status===200)throw error;
        expect(String(error)).toContain('RL9C2B2C_BLOCKED');
      });
    }
    expect(calls).toBe(7);
  });

  it('keeps valid Vault public/anon credentials only on their own host, never PRIMARY',async()=>{
    const seen:any[]=[];
    const report=await proveCanaryPhase({
      phase:'ANONYMOUS_DENIAL',config,publicKey,
      fetcher:async(url:string,opts:any)=>{
        seen.push({url,headers:opts.headers});
        return response(url===vaultSettings?200:403);
      },
    });
    expect(seen.map(x=>x.url)).toEqual([vaultSettings,vaultCanary]);
    expect(seen.every(x=>x.headers.apikey===publicKey)).toBe(true);
    expect(seen.every(x=>!('authorization' in x.headers))).toBe(true);
    expect(report.status).toBe('PASS');
    expect(report.evidence).toBe('VALID_VAULT_ANON_KEY_AND_PRIVATE_CANARY_DENIED');
    expect(JSON.stringify(report)).not.toContain(publicKey);
  });

  it('blocks Vault public-key denial without positive own-gateway admission',async()=>{
    let count=0;
    await expect(proveCanaryPhase({
      phase:'ANONYMOUS_DENIAL',config,publicKey,
      fetcher:async()=>{count++;return response(401);},
    })).rejects.toThrow('RL9C2B2C_BLOCKED');
    expect(count).toBe(1);
    for(const status of [200,400,404,302,500]){
      await expect(proveCanaryPhase({
        phase:'ANONYMOUS_DENIAL',config,publicKey,
        fetcher:async(url:string)=>response(url===vaultSettings?200:status),
      })).rejects.toThrow('RL9C2B2C_BLOCKED');
    }
  });

  it('blocks public key for privileged phase, secret key for public phase, and missing keys',async()=>{
    let count=0;
    const fetcher=async()=>{count++;return response(200,SYNTHETIC_MARKER);};
    await expect(proveCanaryPhase({phase:'PRIMARY_SELF_CONTROL',config,credential:publicKey,fetcher})).rejects.toThrow('RL9C2B2C_BLOCKED');
    await expect(proveCanaryPhase({phase:'VAULT_POSITIVE',config,credential:publicKey,fetcher})).rejects.toThrow('RL9C2B2C_BLOCKED');
    await expect(proveCanaryPhase({phase:'ANONYMOUS_DENIAL',config,publicKey:secret,fetcher})).rejects.toThrow('RL9C2B2C_BLOCKED');
    await expect(proveCanaryPhase({phase:'PRIMARY_SELF_CONTROL',config,fetcher})).rejects.toThrow('RL9C2B2C_BLOCKED');
    await expect(proveCanaryPhase({phase:'ANONYMOUS_DENIAL',config,fetcher})).rejects.toThrow('RL9C2B2C_BLOCKED');
    expect(count).toBe(0);
  });

  it('only allows structurally valid legacy JWT claims for corresponding role',async()=>{
    const jwt=(role:string)=>'eyJhbGciOiJIUzI1NiJ9.'+
      Buffer.from(JSON.stringify({role})).toString('base64url')+'.c2ln';
    await expect(proveCanaryPhase({
      phase:'PRIMARY_SELF_CONTROL',config,credential:jwt('anon'),
      fetcher:async()=>response(200),
    })).rejects.toThrow('RL9C2B2C_BLOCKED');
    const calls:any[]=[];
    const report=await proveCanaryPhase({
      phase:'PRIMARY_SELF_CONTROL',config,credential:jwt('service_role'),
      fetcher:async(url:string,opts:any)=>{
        calls.push({url,headers:opts.headers});return response(200);
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(primaryBucket);
    expect(calls[0].headers.authorization).toBe('Bearer '+jwt('service_role'));
    expect(report.evidence).toBe('PRIMARY_KEY_VALID_ON_OWN_PROJECT_ONLY');
  });

  it('rejects changed synthetic canary, oversized body and non-200 Vault positive',async()=>{
    for(const body of ['incorrect',SYNTHETIC_MARKER+'extra','a'.repeat(1025)]){
      await expect(proveCanaryPhase({
        phase:'VAULT_POSITIVE',config,credential:secret,
        fetcher:async()=>response(200,body),
      })).rejects.toThrow('RL9C2B2C_BLOCKED');
    }
    for(const status of [400,401,403,404,500,302]){
      await expect(proveCanaryPhase({
        phase:'VAULT_POSITIVE',config,credential:secret,
        fetcher:async()=>response(status),
      })).rejects.toThrow('RL9C2B2C_BLOCKED');
    }
  });

  it('rejects transport exceptions without leaking their content',async()=>{
    await expect(proveCanaryPhase({
      phase:'PRIMARY_SELF_CONTROL',config,credential:secret,
      fetcher:async()=>{throw Error('secret from transport');},
    })).rejects.toThrow('RL9C2B2C_BLOCKED');
  });

  it('validates distinct project references and synthetic-only object path',()=>{
    const malformed=[
      {...config,primaryProjectRef:vault},
      {...config,objectPath:'real-holdout.txt'},
      {...config,objectPath:'rl9c2b2c-isolation-canary-v1/../../escape'},
      {...config,bucket:'https://invalid.example'},
      {...config,primaryProjectRef:'bad'},
      {...config,vaultProjectRef:'evil.example.com'},
    ];
    for(const input of malformed){
      expect(()=>validateCanaryConfig(input)).toThrow('RL9C2B2C_BLOCKED');
    }
  });

  it('blocks poison descriptors, inherited accessors and additional attributes',()=>{
    const inherited=Object.assign(Object.create({toJSON:()=>true}),config);
    const accessor={...config};
    Object.defineProperty(accessor,'bucket',{get(){throw Error('secret leak');},enumerable:true});
    for(const input of [inherited,accessor,{...config,extra:'x'},
      {...config,[Symbol('hidden')]:true}]){
      expect(()=>validateCanaryConfig(input)).toThrow('RL9C2B2C_BLOCKED');
    }
  });

  it('binds subject digest to both project refs and exact canary',()=>{
    expect(canarySubjectDigest(config)).not.toBe(
      canarySubjectDigest({...config,primaryProjectRef:'d'.repeat(20)}),
    );
    expect(canarySubjectDigest(config)).not.toBe(
      canarySubjectDigest({...config,vaultProjectRef:'e'.repeat(20)}),
    );
  });

  it('requires a secure private mount, rejects symlinks, hardlinks and writable parent',()=>{
    if(process.platform!=='linux')return;
    const dir=mkdtempSync(join(homedir(),'.syntrake-rl9c-test-'));
    const file=join(dir,'credential'),symlink=join(dir,'link'),hardlink=join(dir,'hardlink');
    try{
      chmodSync(dir,0o700);
      writeFileSync(file,secret,{mode:0o600});
      expect(readPrivateMount(file)).toBe(secret);
      chmodSync(file,0o644);
      expect(()=>readPrivateMount(file)).toThrow('RL9C2B2C_BLOCKED');
      chmodSync(file,0o600);
      symlinkSync(file,symlink);
      expect(()=>readPrivateMount(symlink)).toThrow('RL9C2B2C_BLOCKED');
      linkSync(file,hardlink);
      expect(()=>readPrivateMount(file)).toThrow('RL9C2B2C_BLOCKED');
      unlinkSync(hardlink);
      chmodSync(dir,0o777);
      expect(()=>readPrivateMount(file)).toThrow('RL9C2B2C_BLOCKED');
    }finally{rmSync(dir,{recursive:true,force:true});}
  });

  it('rejects credential whitespace or invalid length without making HTTP calls',async()=>{
    for(const credential of ['',secret+' ','too short',secret+'\nSECRET']){
      await expect(proveCanaryPhase({
        phase:'PRIMARY_SELF_CONTROL',config,credential,
        fetcher:async()=>{throw Error('unexpected HTTP');},
      })).rejects.toThrow('RL9C2B2C_BLOCKED');
    }
  });
});
