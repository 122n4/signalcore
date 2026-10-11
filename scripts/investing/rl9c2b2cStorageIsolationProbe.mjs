/**
 * RL-9C2B2C: operator-side Supabase Storage isolation canary, NOT an operational Vault.
 * Execute each role on its separately controlled host/principal. No ordinary app import.
 * Read-only: never creates buckets or objects and never accepts real holdout locators.
 */
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SYNTHETIC_MARKER = 'SYNTRAKE:RL9C2B2C:SYNTHETIC_CANARY_V1\n';
const KIND = 'SYNTRAKE_RL9C2B2C_ISOLATION_CANARY_V1';
const REF = /^[a-z]{20}$/u;
const BUCKET = /^[a-z][a-z0-9-]{2,62}$/u;
const PATH = /^rl9c2b2c-isolation-canary-v1\/[a-f0-9]{32}\.txt$/u;
const PHASES = new Set(['VAULT_POSITIVE', 'PRIMARY_DENIAL', 'ANONYMOUS_DENIAL']);
const MAX_CANARY_BYTES = 1024;
function blocked(){ throw new Error('RL9C2B2C_BLOCKED'); }
function keysExact(obj, expected){
  if(!obj || typeof obj !== 'object' || Array.isArray(obj)) blocked();
  const keys=Object.keys(obj).sort();
  if(keys.length!==expected.length || keys.some((k,i)=>k!==[...expected].sort()[i])) blocked();
}
export function validateCanaryConfig(input){
  try {
    const fields=['primaryProjectRef','vaultProjectRef','bucket','objectPath'];
    keysExact(input,fields);
    // Inspect DESCRIPTORS before ever reading values, spreading, or serializing.
    if(Object.getPrototypeOf(input)!==Object.prototype||Reflect.ownKeys(input).length!==4)blocked();
    const descriptors=Object.getOwnPropertyDescriptors(input);
    if(fields.some(k=>!descriptors[k]||!descriptors[k].enumerable||!('value' in descriptors[k])))blocked();
    const config=Object.freeze(Object.fromEntries(fields.map(k=>[k,descriptors[k].value])));
    if(typeof config.primaryProjectRef!=='string'||!REF.test(config.primaryProjectRef)||
      typeof config.vaultProjectRef!=='string'||!REF.test(config.vaultProjectRef)||
      config.primaryProjectRef===config.vaultProjectRef||
      typeof config.bucket!=='string'||!BUCKET.test(config.bucket)||
      typeof config.objectPath!=='string'||!PATH.test(config.objectPath))blocked();
    return config;
  } catch { blocked(); }
}
export function canarySubjectDigest(config){
  const c=validateCanaryConfig(config);
  return createHash('sha256').update(['SYNTRAKE:RL9C2B2C:CANARY_SUBJECT:V1',c.primaryProjectRef,c.vaultProjectRef,c.bucket,c.objectPath,SYNTHETIC_MARKER].join('\n'),'utf8').digest('hex');
}
function storageUrl(ref,c){return `https://${ref}.supabase.co/storage/v1/object/authenticated/${encodeURIComponent(c.bucket)}/${c.objectPath}`;}
async function requestStatus(url,key,fetcher,readBody=false){
  const controller = new AbortController();
  const timer=setTimeout(()=>controller.abort(),8000);
  try {
    const headers={ 'accept': readBody?'application/octet-stream':'application/json' };
    if(key){
      headers.apikey=key;
      // Supabase modern sb_secret keys are API keys, NOT JWT bearer tokens.
      if(!key.startsWith('sb_secret_')) headers.authorization=`Bearer ${key}`;
    }
    const response=await fetcher(url,{method:'GET',headers,signal:controller.signal,redirect:'manual',cache:'no-store'});
    if(!response||!Number.isInteger(response.status))blocked();
    if(!readBody){try{await response.body?.cancel?.()}catch{} return {status:response.status};}
    if(response.status!==200){try{await response.body?.cancel?.()}catch{} return {status:response.status};}
    let chunks=[],size=0;
    if(!response.body?.getReader)blocked();
    const reader=response.body.getReader();
    while(true){const {done,value}=await reader.read();if(done)break;size+=value?.byteLength||0;if(size>MAX_CANARY_BYTES){await reader.cancel();blocked();}chunks.push(Buffer.from(value));}
    return {status:response.status,content:Buffer.concat(chunks,size)};
  }catch{blocked();}finally{clearTimeout(timer);}
}
/**
 * Evaluator is intentionally injectable for offline negative-vector tests.
 * @param {{phase:string, config:{primaryProjectRef:string,vaultProjectRef:string,bucket:string,objectPath:string}, credential?:string, fetcher?:(url:string,options:RequestInit)=>Promise<Response>}} options
 */
export async function proveCanaryPhase({phase,config,credential=undefined,fetcher=fetch}){
  if(!PHASES.has(phase)||typeof fetcher!=='function')blocked();
  const c=validateCanaryConfig(config);
  if(phase==='ANONYMOUS_DENIAL'){if(credential!==undefined)blocked();}
  else if(typeof credential!=='string'||credential.length<20||credential.length>4096||/[\s\r\n]/u.test(credential))blocked();
  const subjectDigest=canarySubjectDigest(c);
  const url=storageUrl(c.vaultProjectRef,c);
  let evidence;
  if(phase==='VAULT_POSITIVE'){
    const answer=await requestStatus(url,credential,fetcher,true);
    if(answer.status!==200||!answer.content?.equals(Buffer.from(SYNTHETIC_MARKER,'utf8')))blocked();
    evidence='PRIVATE_CANARY_CONFIRMED';
  }else if(phase==='PRIMARY_DENIAL'){
    // Prove the primary key is actually accepted by its OWN project.
    // If a fake/expired key is supplied, the negative result cannot pass.
    const self=await requestStatus(`https://${c.primaryProjectRef}.supabase.co/storage/v1/bucket`,credential,fetcher);
    if(self.status!==200)blocked();
    const denied=await requestStatus(url,credential,fetcher);
    if(denied.status!==401&&denied.status!==403)blocked();
    evidence='PRIMARY_KEY_VALID_ON_PRIMARY_PROJECT_AND_DENIED_BY_VAULT';
  }else{
    const denied=await requestStatus(url,undefined,fetcher);
    if(denied.status!==401&&denied.status!==403)blocked();
    evidence='ANONYMOUS_DENIED_BY_VAULT';
  }
  // Report contains no credential, bucket name, endpoint, private locator, or response body.
  return Object.freeze({kind:KIND,phase,status:'PASS',subjectDigest,evidence});
}
function privateFile(filename){
  if(typeof filename!=='string'||!isAbsolute(filename))blocked();
  const pathname=resolve(filename);const cwd=resolve(process.cwd());
  if(pathname===cwd||pathname.startsWith(cwd+sep)||process.platform==='win32'||typeof process.getuid!=='function')blocked();
  try{const st=lstatSync(pathname);if(!st.isFile()||st.isSymbolicLink()||st.uid!==process.getuid()||(st.mode&0o077)!==0)blocked();if(realpathSync(pathname)!==pathname)blocked();return readFileSync(pathname,'utf8');}catch{blocked();}
}
function assertCleanProcessEnvironment(env){
  if(Object.entries(env).some(([key,value])=>value && /^(SUPABASE_|DATABASE_URL$|PGPASSWORD$|CLERK_|STRIPE_|NEXT_PUBLIC_|INVESTING_|TRADING_)/u.test(key)))blocked();
}
export async function runProbeCli({env=process.env,fetcher=fetch}={}){
  assertCleanProcessEnvironment(env);
  if(process.argv.length!==2)blocked();
  const phase=env.SYNTRAKE_VAULT_C2C_PHASE;
  const config=JSON.parse(privateFile(env.SYNTRAKE_VAULT_C2C_CONFIG_FILE));
  const credential=phase==='ANONYMOUS_DENIAL'?undefined:privateFile(env.SYNTRAKE_VAULT_C2C_CREDENTIAL_FILE).replace(/\r?\n$/u,'');
  const report=await proveCanaryPhase({phase,config,credential,fetcher});
  process.stdout.write(JSON.stringify(report)+'\n');
}
if(process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href){
  runProbeCli().catch(()=>{process.stderr.write('RL9C2B2C_BLOCKED\n');process.exitCode=1;});
}
