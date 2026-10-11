/**
 * RL-9C2B2C: operator-side Supabase Storage isolation canary, NOT an operational Vault.
 * Execute each role on its separately controlled host/principal. No ordinary app import.
 * Read-only: never creates buckets or objects and never accepts real holdout locators.
 */
import { createHash } from 'node:crypto';
import { openSync, closeSync, fstatSync, readSync, lstatSync, constants } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SYNTHETIC_MARKER = 'SYNTRAKE:RL9C2B2C:SYNTHETIC_CANARY_V1\n';
const KIND = 'SYNTRAKE_RL9C2B2C_ISOLATION_CANARY_V1';
const REF = /^[a-z]{20}$/u;
const BUCKET = /^[a-z][a-z0-9-]{2,62}$/u;
const PATH = /^rl9c2b2c-isolation-canary-v1\/[a-f0-9]{32}\.txt$/u;
const PHASES = new Set(['VAULT_POSITIVE', 'PRIMARY_DENIAL', 'ANONYMOUS_DENIAL']);
const MAX_CANARY_BYTES = 1024;
const SECRET_KEY = /^sb_secret_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}$/u;
const PUBLISHABLE_KEY = /^sb_publishable_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}$/u;
const JWT_PART = /^[A-Za-z0-9_-]+$/u;
function legacyJwtRole(key, expectedRole) {
  const parts = key.split('.');
  if (parts.length !== 3 || parts.some(x => !JWT_PART.test(x))) blocked();
  try {
    const raw = Buffer.from(parts[1], 'base64url');
    if (raw.length > 1024 || raw.toString('base64url') !== parts[1]) blocked();
    const claims = JSON.parse(raw.toString('utf8'));
    if (!claims || typeof claims !== 'object' || claims.role !== expectedRole) blocked();
  } catch { blocked(); }
}
function validateKeyRole(key, role) {
  if (typeof key !== 'string' || key.length < 20 || key.length > 4096 || /\s/u.test(key)) blocked();
  if (key.startsWith('sb_')) {
    if (!(role === 'service_role' ? SECRET_KEY : PUBLISHABLE_KEY).test(key)) blocked();
  } else legacyJwtRole(key, role);
}

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
      if(!key.startsWith('sb_secret_') && !key.startsWith('sb_publishable_')) headers.authorization=`Bearer ${key}`;
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
 * @param {{phase:string, config:{primaryProjectRef:string,vaultProjectRef:string,bucket:string,objectPath:string}, credential?:string, publicKey?:string, fetcher?:(url:string,options:RequestInit)=>Promise<Response>}} options
 */
export async function proveCanaryPhase({phase,config,credential=undefined,publicKey=undefined,fetcher=fetch}){
  if(!PHASES.has(phase)||typeof fetcher!=='function')blocked();
  const c=validateCanaryConfig(config);
  if(phase==='ANONYMOUS_DENIAL'){
    // Missing apikey may produce gateway 401 even for a public Storage bucket.
    if(credential!==undefined)blocked();
    validateKeyRole(publicKey,'anon');
  } else {
    if(publicKey!==undefined)blocked();
    validateKeyRole(credential,'service_role');
  }
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
    const denied=await requestStatus(url,publicKey,fetcher);
    if(denied.status!==401&&denied.status!==403)blocked();
    evidence='ANONYMOUS_DENIED_BY_VAULT';
  }
  // Report contains no credential, bucket name, endpoint, private locator, or response body.
  return Object.freeze({kind:KIND,phase,status:'PASS',subjectDigest,evidence});
}
/**
 * Read a private operator mount through a single pinned file descriptor.
 * Block world/group-writable parent directories, path symlinks, hard links,
 * non-regular files, oversized inputs and time-of-check/path-switch races.
 */
export function readPrivateMount(filename){
  if(typeof filename!=='string'||!isAbsolute(filename)||
      process.platform!=='linux'||typeof process.getuid!=='function')blocked();
  const pathname=resolve(filename),cwd=resolve(process.cwd());
  if(pathname===cwd||pathname.startsWith(cwd+sep))blocked();
  let fd;
  try {
    // Walk each parent, forbidding attacker-writable/symlink path components.
    for(let dir=dirname(pathname);;){
      const st=lstatSync(dir);
      if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o022)!==0||
          (st.uid!==0&&st.uid!==process.getuid()))blocked();
      const next=dirname(dir);
      if(next===dir)break;
      dir=next;
    }
    fd=openSync(pathname,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const st=fstatSync(fd);
    if(!st.isFile()||st.nlink!==1||st.uid!==process.getuid()||
        (st.mode&0o077)!==0||st.size<1||st.size>8192)blocked();
    const buffer=Buffer.alloc(st.size+1);
    const amount=readSync(fd,buffer,0,buffer.length,0);
    if(amount!==st.size||fstatSync(fd).size!==st.size)blocked();
    return buffer.subarray(0,amount).toString('utf8');
  }catch{blocked();}finally{if(fd!==undefined){try{closeSync(fd)}catch{}}}
}
function assertCleanProcessEnvironment(env){
  if(Object.entries(env).some(([key,value])=>value && /^(SUPABASE_|DATABASE_URL$|PGPASSWORD$|CLERK_|STRIPE_|NEXT_PUBLIC_|INVESTING_|TRADING_)/u.test(key)))blocked();
}
export async function runProbeCli({env=process.env,fetcher=fetch}={}){
  assertCleanProcessEnvironment(env);
  if(process.argv.length!==2)blocked();
  const phase=env.SYNTRAKE_VAULT_C2C_PHASE;
  const config=JSON.parse(readPrivateMount(env.SYNTRAKE_VAULT_C2C_CONFIG_FILE));
  const credential=phase==='ANONYMOUS_DENIAL'?undefined:readPrivateMount(env.SYNTRAKE_VAULT_C2C_CREDENTIAL_FILE).replace(/\r?\n$/u,'');
  const publicKey=phase==='ANONYMOUS_DENIAL'?readPrivateMount(env.SYNTRAKE_VAULT_C2C_PUBLIC_KEY_FILE).replace(/\r?\n$/u,''):undefined;
  const report=await proveCanaryPhase({phase,config,credential,publicKey,fetcher});
  process.stdout.write(JSON.stringify(report)+'\n');
}
if(process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href){
  runProbeCli().catch(()=>{process.stderr.write('RL9C2B2C_BLOCKED\n');process.exitCode=1;});
}
