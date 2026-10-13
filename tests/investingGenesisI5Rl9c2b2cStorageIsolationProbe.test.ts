import { describe, it, expect } from 'vitest';
import { chmodSync, linkSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { canarySubjectDigest, proveCanaryPhase, readPrivateMount, validateCanaryConfig, SYNTHETIC_MARKER } from '../scripts/investing/rl9c2b2cStorageIsolationProbe.mjs';

const primary = 'a'.repeat(20), vault = 'b'.repeat(20);
const config = {primaryProjectRef: primary, vaultProjectRef: vault, bucket: 'vault-private-canary', objectPath: 'rl9c2b2c-isolation-canary-v1/'+'c'.repeat(32)+'.txt'};
const cred='sb_secret_'+'A'.repeat(22)+'_'+'B'.repeat(8);
const publicKey='sb_publishable_'+'C'.repeat(22)+'_'+'D'.repeat(8);
function response(status:number, body='') { return new Response(body, {status}); }
const target = `https://${vault}.supabase.co/storage/v1/object/authenticated/vault-private-canary/${config.objectPath}`;
const own = `https://${primary}.supabase.co/storage/v1/bucket`;
const anonControl = `https://${vault}.supabase.co/auth/v1/settings`;

describe('RL-9C2B2C Storage isolation canary preflight, no real credentials',()=>{
  it('proves positive read of same extant synthetic private canary with a credential',async()=>{
    const seen:any[]=[];
    const result=await proveCanaryPhase({phase:'VAULT_POSITIVE',config,credential:cred,fetcher:async (url:string,opts:any)=>{
      seen.push({url,opts});return response(200,SYNTHETIC_MARKER);
    }});
    expect(result).toEqual({kind:'SYNTRAKE_RL9C2B2C_ISOLATION_CANARY_V1',phase:'VAULT_POSITIVE',status:'PASS',subjectDigest:canarySubjectDigest(config),evidence:'PRIVATE_CANARY_CONFIRMED'});
    expect(seen.map(s=>s.url)).toEqual([target]);
    expect(seen[0].opts.headers.apikey).toBe(cred);
    expect(seen[0].opts.headers).not.toHaveProperty('authorization');
    expect(seen[0].opts.redirect).toBe('manual');
    expect(JSON.stringify(result)).not.toContain(cred);
    expect(JSON.stringify(result)).not.toContain(config.objectPath);
  });
  it('proves ordinary credential works on primary project BEFORE denying it on extant Vault object',async()=>{
    const calls:string[]=[];
    const out=await proveCanaryPhase({phase:'PRIMARY_DENIAL',config,credential:cred,fetcher:async (url:string)=>{
      calls.push(url);return url===own?response(200,'[]'):response(403,'no-access');
    }});
    expect(calls).toEqual([own,target]);
    expect(out.evidence).toBe('PRIMARY_KEY_VALID_ON_PRIMARY_PROJECT_AND_DENIED_BY_VAULT');
  });
  it('allows only the exact live Supabase Storage foreign-key missing-Authorization 400, after primary 200',async()=>{
    const seen:string[]=[];
    const result=await proveCanaryPhase({phase:'PRIMARY_DENIAL',config,credential:cred,fetcher:async(url:string)=>{
      seen.push(url);
      return url===own?response(200,'[]'):new Response(JSON.stringify({
        statusCode:'400',error:'InvalidRequest',
        message:"headers must have required property 'authorization'",
      }),{status:400,headers:{'content-type':'application/json'}});
    }});
    expect(seen).toEqual([own,target]);
    expect(result.evidence).toBe('PRIMARY_KEY_VALID_AND_VAULT_GATEWAY_AUTHORIZATION_ABSENT');
    expect(result.subjectDigest).toBe(canarySubjectDigest(config));
  });
  it('rejects unrelated Storage 400s, partial messages, missing errors and oversize responses',async()=>{
    const cases=[
      {error:'InvalidRequest',message:'Unrelated request error'},
      {error:'InvalidRequest',message:'headers must have required property authorization'},
      {error:'Unauthorized',message:"headers must have required property 'authorization'"},
      {message:"headers must have required property 'authorization'"},
      {error:'InvalidRequest',message:"headers must have required property 'authorization'",garbage:'x'.repeat(600)},
    ];
    for(const body of cases){
      await expect(proveCanaryPhase({phase:'PRIMARY_DENIAL',config,credential:cred,fetcher:async(url:string)=>
        url===own?response(200,'[]'):response(400,JSON.stringify(body)),
      })).rejects.toThrow('RL9C2B2C_BLOCKED');
    }
    await expect(proveCanaryPhase({phase:'PRIMARY_DENIAL',config,credential:cred,fetcher:async(url:string)=>
      url===own?response(200,'[]'):response(400,''),
    })).rejects.toThrow('RL9C2B2C_BLOCKED');
    await expect(proveCanaryPhase({phase:'PRIMARY_DENIAL',config,credential:cred,fetcher:async(url:string)=>
      url===own?response(403):response(400,JSON.stringify({
        error:'InvalidRequest',message:"headers must have required property 'authorization'",
      })),
    })).rejects.toThrow('RL9C2B2C_BLOCKED');
  });
  it('uses apikey only for modern sb_secret keys; legacy JWT credentials may use Bearer',async()=>{
    const modern = cred;
    const seen:any[]=[];
    const result=await proveCanaryPhase({phase:'PRIMARY_DENIAL',config,credential:modern,fetcher:async(url:string,opts:any)=>{
      seen.push({url,headers:opts.headers});return response(url===own?200:403);
    }});
    expect(result.status).toBe('PASS');
    expect(seen).toHaveLength(2);
    for(const req of seen){expect(req.headers.apikey).toBe(modern);expect(req.headers).not.toHaveProperty('authorization');}
    expect(JSON.stringify(result)).not.toContain(modern);
  });
  it('proves Vault anonymous key admission before private object denial',async()=>{
    const calls:string[]=[];
    const out=await proveCanaryPhase({phase:'ANONYMOUS_DENIAL',config,publicKey,fetcher:async (url:string,opts:any)=>{
      calls.push(url);
      expect(opts.headers).not.toHaveProperty('authorization');
      expect(opts.headers.apikey).toBe(publicKey);
      return response(url===anonControl?200:401);
    }});
    expect(calls).toEqual([anonControl,target]);
    expect(out.evidence).toBe('VALID_VAULT_ANON_KEY_AND_PRIVATE_CANARY_DENIED');
  });
  it('requires Vault anonymous API key so gateway-only 401 cannot pass',async()=>{
    await expect(proveCanaryPhase({phase:'ANONYMOUS_DENIAL',config,fetcher:async()=>response(401)})).rejects.toThrow('RL9C2B2C_BLOCKED');
    await expect(proveCanaryPhase({phase:'ANONYMOUS_DENIAL',config,publicKey:cred,fetcher:async()=>response(401)})).rejects.toThrow('RL9C2B2C_BLOCKED');
    const ok=await proveCanaryPhase({phase:'ANONYMOUS_DENIAL',config,publicKey,fetcher:async(url:string,opts:any)=>{
      expect([anonControl,target]).toContain(url);
      expect(opts.headers.apikey).toBe(publicKey);
      return response(url===anonControl?200:403);
    }});
    expect(ok.status).toBe('PASS');
  });
  it('rejects invalid or revoked Vault public key before evaluating object denial',async()=>{
    let count=0;
    await expect(proveCanaryPhase({phase:'ANONYMOUS_DENIAL',config,publicKey,fetcher:async()=>{
      count++;return response(401);
    }})).rejects.toThrow('RL9C2B2C_BLOCKED');
    expect(count).toBe(1);
  });
  it('disallows publishable credentials as privileged primary authority even with a mocked 200',async()=>{
    await expect(proveCanaryPhase({phase:'PRIMARY_DENIAL',config,credential:publicKey,fetcher:async()=>response(200)})).rejects.toThrow('RL9C2B2C_BLOCKED');
  });
  it('prechecks legacy JWT claims, requiring service_role (live signature verification remains external)',async()=>{
    const jwt=(role:string)=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.c2ln';
    await expect(proveCanaryPhase({phase:'PRIMARY_DENIAL',config,credential:jwt('anon'),fetcher:async()=>response(200)})).rejects.toThrow('RL9C2B2C_BLOCKED');
    const result=await proveCanaryPhase({phase:'PRIMARY_DENIAL',config,credential:jwt('service_role'),fetcher:async(url:string,opts:any)=>{
      expect(opts.headers.authorization).toBe('Bearer '+jwt('service_role'));
      return response(url===own?200:403);
    }});
    expect(result.status).toBe('PASS');
  });
  it('fails closed on anonymous/public 200 and ordinary cross-project 200',async()=>{
    await expect(proveCanaryPhase({phase:'ANONYMOUS_DENIAL',config,publicKey,fetcher:async()=>response(200,SYNTHETIC_MARKER)})).rejects.toThrow('RL9C2B2C_BLOCKED');
    await expect(proveCanaryPhase({phase:'PRIMARY_DENIAL',config,credential:cred,fetcher:async()=>response(200,SYNTHETIC_MARKER)})).rejects.toThrow('RL9C2B2C_BLOCKED');
  });
  it('rejects 404 absent object, 302 redirects, 500, and network failure as denial evidence',async()=>{
    for(const code of [302,404,500]){
      await expect(proveCanaryPhase({phase:'ANONYMOUS_DENIAL',config,publicKey,
        fetcher:async(url:string)=>response(url===anonControl?200:code),
      })).rejects.toThrow('RL9C2B2C_BLOCKED');
      await expect(proveCanaryPhase({phase:'PRIMARY_DENIAL',config,credential:cred,fetcher:async (url:string)=>response(url===own?200:code)})).rejects.toThrow('RL9C2B2C_BLOCKED');
    }
    await expect(proveCanaryPhase({phase:'ANONYMOUS_DENIAL',config,publicKey,fetcher:async()=>{throw Error('my leaked credential!');}})).rejects.toThrow('RL9C2B2C_BLOCKED');
  });
  it('requires operational primary credential by self-project positive read',async()=>{
    let requests=0;
    await expect(proveCanaryPhase({phase:'PRIMARY_DENIAL',config,credential:cred,fetcher:async()=>{requests++;return response(401);}})).rejects.toThrow('RL9C2B2C_BLOCKED');
    expect(requests).toBe(1);
  });
  it('rejects false positive 200 with wrong bytes and oversized bodies',async()=>{
    await expect(proveCanaryPhase({phase:'VAULT_POSITIVE',config,credential:cred,fetcher:async()=>response(200,'wrong')})).rejects.toThrow('RL9C2B2C_BLOCKED');
    await expect(proveCanaryPhase({phase:'VAULT_POSITIVE',config,credential:cred,fetcher:async()=>response(200,'a'.repeat(1025))})).rejects.toThrow('RL9C2B2C_BLOCKED');
  });
  it('rejects same project refs, noncanary locators, injected URL components, invalid buckets',()=>{
    for (const bad of [{...config,vaultProjectRef:primary},{...config,objectPath:'real-holdout.txt'},
      {...config,objectPath:'rl9c2b2c-isolation-canary-v1/../../data'},
      {...config,bucket:'https://evil.test'},
      {...config,primaryProjectRef:'too-short'}]){
      expect(()=>validateCanaryConfig(bad)).toThrow('RL9C2B2C_BLOCKED');
    }
  });
  it('binds the subject digest to the primary project identity as well as Vault and canary',()=>{
    expect(canarySubjectDigest(config)).not.toBe(canarySubjectDigest({...config,primaryProjectRef:'d'.repeat(20)}));
  });
  it('rejects inherited serializers, symbols, getters and extra fields',()=>{
    const poison=Object.assign(Object.create({toJSON:()=>({public:true})}),config);
    const getter={...config};Object.defineProperty(getter,'bucket',{get(){throw Error('secret leak!');},enumerable:true});
    const symbol={...config,[Symbol('bad')]:'value'};
    for(const v of [poison,getter,symbol,{...config,extra:'x'}])expect(()=>validateCanaryConfig(v)).toThrow('RL9C2B2C_BLOCKED');
  });
  it('reads only secure owner-controlled credential mounts via pinned descriptor',()=>{
    if(process.platform!=='linux')return;
    const dir=mkdtempSync(join(homedir(),'.syntrake-c2c-private-test-'));
    const file=join(dir,'secret-key'),link=join(dir,'symlink-key'),hard=join(dir,'hardlinked-key');
    try {
      chmodSync(dir,0o700);
      writeFileSync(file,cred,{mode:0o600});
      expect(readPrivateMount(file)).toBe(cred);
      chmodSync(file,0o644);
      expect(()=>readPrivateMount(file)).toThrow('RL9C2B2C_BLOCKED');
      chmodSync(file,0o600);
      symlinkSync(file,link);
      expect(()=>readPrivateMount(link)).toThrow('RL9C2B2C_BLOCKED');
      linkSync(file,hard);
      expect(()=>readPrivateMount(file)).toThrow('RL9C2B2C_BLOCKED');
      unlinkSync(hard);
      chmodSync(dir,0o777);
      expect(()=>readPrivateMount(file)).toThrow('RL9C2B2C_BLOCKED');
    } finally { rmSync(dir,{recursive:true,force:true}); }
  });
  it('rejects anonymous credentials and incorrect/unsafe credential formats',async()=>{
    await expect(proveCanaryPhase({phase:'ANONYMOUS_DENIAL',config,credential:cred,fetcher:async()=>response(401)})).rejects.toThrow('RL9C2B2C_BLOCKED');
    for (const unsafe of ['too-short', cred+'\nSECRET',cred+' ', ''])
      await expect(proveCanaryPhase({phase:'VAULT_POSITIVE',config,credential:unsafe,fetcher:async()=>response(200,SYNTHETIC_MARKER)})).rejects.toThrow('RL9C2B2C_BLOCKED');
  });
});
