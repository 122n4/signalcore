import { describe, it, expect } from 'vitest';
import { canarySubjectDigest, proveCanaryPhase, validateCanaryConfig, SYNTHETIC_MARKER } from '../scripts/investing/rl9c2b2cStorageIsolationProbe.mjs';

const primary = 'a'.repeat(20), vault = 'b'.repeat(20);
const config = {primaryProjectRef: primary, vaultProjectRef: vault, bucket: 'vault-private-canary', objectPath: 'rl9c2b2c-isolation-canary-v1/'+'c'.repeat(32)+'.txt'};
const cred='SYNTHETIC_NONREAL_CREDENTIAL_0123456789';
function response(status:number, body='') { return new Response(body, {status}); }
const target = `https://${vault}.supabase.co/storage/v1/object/authenticated/vault-private-canary/${config.objectPath}`;
const own = `https://${primary}.supabase.co/storage/v1/bucket`;

describe('RL-9C2B2C Storage isolation canary preflight, no real credentials',()=>{
  it('proves positive read of same extant synthetic private canary with a credential',async()=>{
    const seen:any[]=[];
    const result=await proveCanaryPhase({phase:'VAULT_POSITIVE',config,credential:cred,fetcher:async (url:string,opts:any)=>{
      seen.push({url,opts});return response(200,SYNTHETIC_MARKER);
    }});
    expect(result).toEqual({kind:'SYNTRAKE_RL9C2B2C_ISOLATION_CANARY_V1',phase:'VAULT_POSITIVE',status:'PASS',subjectDigest:canarySubjectDigest(config),evidence:'PRIVATE_CANARY_CONFIRMED'});
    expect(seen.map(s=>s.url)).toEqual([target]);
    expect(seen[0].opts.headers.authorization).toBe(`Bearer ${cred}`);
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
  it('uses apikey only for modern sb_secret keys; legacy JWT credentials may use Bearer',async()=>{
    const modern = 'sb_secret_'+'SYNTHETIC_NONREAL_0123456789012345';
    const seen:any[]=[];
    const result=await proveCanaryPhase({phase:'PRIMARY_DENIAL',config,credential:modern,fetcher:async(url:string,opts:any)=>{
      seen.push({url,headers:opts.headers});return response(url===own?200:403);
    }});
    expect(result.status).toBe('PASS');
    expect(seen).toHaveLength(2);
    for(const req of seen){expect(req.headers.apikey).toBe(modern);expect(req.headers).not.toHaveProperty('authorization');}
    expect(JSON.stringify(result)).not.toContain(modern);
  });
  it('proves anonymous is denied on same Vault object',async()=>{
    const out=await proveCanaryPhase({phase:'ANONYMOUS_DENIAL',config,fetcher:async (url:string,opts:any)=>{
      expect(url).toBe(target);expect(opts.headers).not.toHaveProperty('authorization');return response(401);
    }});
    expect(out.evidence).toBe('ANONYMOUS_DENIED_BY_VAULT');
  });
  it('fails closed on anonymous/public 200 and ordinary cross-project 200',async()=>{
    await expect(proveCanaryPhase({phase:'ANONYMOUS_DENIAL',config,fetcher:async()=>response(200,SYNTHETIC_MARKER)})).rejects.toThrow('RL9C2B2C_BLOCKED');
    await expect(proveCanaryPhase({phase:'PRIMARY_DENIAL',config,credential:cred,fetcher:async()=>response(200,SYNTHETIC_MARKER)})).rejects.toThrow('RL9C2B2C_BLOCKED');
  });
  it('rejects 404 absent object, 302 redirects, 500, and network failure as denial evidence',async()=>{
    for(const code of [302,404,500]){
      await expect(proveCanaryPhase({phase:'ANONYMOUS_DENIAL',config,fetcher:async()=>response(code)})).rejects.toThrow('RL9C2B2C_BLOCKED');
      await expect(proveCanaryPhase({phase:'PRIMARY_DENIAL',config,credential:cred,fetcher:async (url:string)=>response(url===own?200:code)})).rejects.toThrow('RL9C2B2C_BLOCKED');
    }
    await expect(proveCanaryPhase({phase:'ANONYMOUS_DENIAL',config,fetcher:async()=>{throw Error('my leaked credential!');}})).rejects.toThrow('RL9C2B2C_BLOCKED');
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
  it('rejects anonymous credentials and incorrect/unsafe credential formats',async()=>{
    await expect(proveCanaryPhase({phase:'ANONYMOUS_DENIAL',config,credential:cred,fetcher:async()=>response(401)})).rejects.toThrow('RL9C2B2C_BLOCKED');
    for (const unsafe of ['too-short', cred+'\nSECRET',cred+' ', ''])
      await expect(proveCanaryPhase({phase:'VAULT_POSITIVE',config,credential:unsafe,fetcher:async()=>response(200,SYNTHETIC_MARKER)})).rejects.toThrow('RL9C2B2C_BLOCKED');
  });
});
