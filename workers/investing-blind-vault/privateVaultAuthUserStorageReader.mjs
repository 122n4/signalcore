/**
 * RL-9C — genuine Vault-project-authenticated Storage ciphertext-only reader.
 *
 * Uses a short-lived Vault-issued user JWT in Authorization and a Vault
 * publishable API key in apikey. These are bound to the SAME Vault host.
 * The Supabase project validates JWT signatures and storage.objects RLS.
 *
 * CRITICAL: this module is only a PRIVATE LOW-LEVEL TRANSPORT. It never
 * grants permission to consume/reveal; an isolated worker must first verify
 * committed burn, embargo admission and one-shot authority. Do NOT expose
 * this factory to browser, Next, ordinary Investing or an HTTP route.
 *
 * No injectable fetcher, no Vault service_role/secret key, no signed URL,
 * no arbitrary host, no redirect and no plaintext output.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { assertIsolatedVaultEnvironmentV1 } from './isolatedServer.mjs';

const REF=/^[a-z]{20}$/u;
const BUCKET=/^[a-z][a-z0-9-]{2,62}$/u;
const HEX=/^[A-F0-9]{64}$/u;
const PUBLIC=/^sb_publishable_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}$/u;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const READER_MODE='VAULT_AUTH_USER_JWT_V1';
const MAX_PLAINTEXT_BYTES=8*1024*1024;
const MAX_RESPONSE_BYTES=Math.ceil(MAX_PLAINTEXT_BYTES/3)*4+2048;
const FIELDS=['environment','vaultProjectRef','privateBucket','publishableKey','authUserJwtFilePath'];
const REQUEST_FIELDS=['privateObjectLocator','expectedCiphertextSha256Hex'];
function blocked(){throw Error('VAULT_UNAVAILABLE');}

function snapshot(raw,fields){
  try{
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||
      (Object.getPrototypeOf(raw)!==Object.prototype &&
       Object.getPrototypeOf(raw)!==null))blocked();
    const keys=Reflect.ownKeys(raw);
    if(keys.length!==fields.length||
      keys.some(k=>typeof k!=='string'||!fields.includes(k)))blocked();
    const desc=Object.getOwnPropertyDescriptors(raw);
    const out=Object.create(null);
    for(const key of fields){
      if(!desc[key]?.enumerable||!('value' in desc[key]))blocked();
      out[key]=desc[key].value;
    }
    return Object.freeze(out);
  }catch{blocked();}
}
function readOwnerOnlyJwt(filename){
  if(process.platform!=='linux'||typeof process.getuid!=='function'||
    typeof filename!=='string'||!isAbsolute(filename))blocked();
  const path=resolve(filename),cwd=resolve(process.cwd());
  if(path===cwd||path.startsWith(cwd+sep))blocked();
  let fd;
  try{
    for(let dir=dirname(path);;){
      const st=lstatSync(dir);
      if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o022)!==0||
        (st.uid!==0&&st.uid!==process.getuid()))blocked();
      const parent=dirname(dir);if(parent===dir)break;dir=parent;
    }
    fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const st=fstatSync(fd);
    if(!st.isFile()||st.nlink!==1||st.uid!==process.getuid()||
       (st.mode&0o777)!==0o600||st.size<80||st.size>8192)blocked();
    const bytes=Buffer.alloc(st.size+1);
    if(readSync(fd,bytes,0,bytes.length,0)!==st.size||
      fstatSync(fd).size!==st.size)blocked();
    const content=bytes.subarray(0,st.size).toString('utf8');
    bytes.fill(0);
    return content.replace(/\r?\n$/u,'');
  }catch{blocked();}
  finally{if(fd!==undefined){try{closeSync(fd);}catch{}}}
}
function checkVaultJwt(raw,ref){
  if(typeof raw!=='string'||raw.length<80||raw.length>8192)blocked();
  const chunks=raw.split('.');
  if(chunks.length!==3||
    chunks.some(x=>!x||!/^[A-Za-z0-9_-]+$/u.test(x)))blocked();
  let header,payload;
  try{
    header=JSON.parse(Buffer.from(chunks[0],'base64url').toString('utf8'));
    payload=JSON.parse(Buffer.from(chunks[1],'base64url').toString('utf8'));
  }catch{blocked();}
  if(!header||Object.getPrototypeOf(header)!==Object.prototype||
    !payload||Object.getPrototypeOf(payload)!==Object.prototype||
    header.alg==='none'||typeof header.alg!=='string'||
    !['HS256','RS256','ES256'].includes(header.alg)||
    payload.iss!==`https://${ref}.supabase.co/auth/v1`||
    payload.aud!=='authenticated'||payload.role!=='authenticated'||
    typeof payload.sub!=='string'||!UUID.test(payload.sub)||
    !Number.isSafeInteger(payload.exp)||
    payload.exp<=Math.floor(Date.now()/1000)+15||
    payload.exp>Math.floor(Date.now()/1000)+86400||
    (payload.nbf!==undefined&&(!Number.isSafeInteger(payload.nbf)||
      payload.nbf>Math.floor(Date.now()/1000)))||
    (payload.iat!==undefined&&(!Number.isSafeInteger(payload.iat)||
      payload.iat>Math.floor(Date.now()/1000))))blocked();
  // Payload parsing is solely a fail-closed precheck. Real cryptographic JWT
  // verification and object RLS authorization MUST occur at Vault Supabase.
  return raw;
}
function assertEncryptedEnvelope(bytes,expectedHex){
  if(bytes.length===0||bytes.length>MAX_RESPONSE_BYTES)blocked();
  const actual=createHash('sha256').update(bytes).digest();
  const expected=Buffer.from(expectedHex,'hex');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))blocked();
  const wire=bytes.toString('utf8');
  if(!wire.endsWith('\n')||wire.slice(0,-1).includes('\n')||
    wire.includes('\r')||!Buffer.from(wire,'utf8').equals(bytes))blocked();
  let value;
  try{value=JSON.parse(wire);}catch{blocked();}
  const envelope=snapshot(value,[
    'schemaVersion','algorithm','keyVersion','nonceHex','ciphertextBase64','tagHex',
  ]);
  if(envelope.schemaVersion!=='BLIND_TRUTH_VAULT_ENVELOPE_V1'||
    envelope.algorithm!=='AES_256_GCM'||
    typeof envelope.keyVersion!=='string'||
    !/^[A-Z][A-Z0-9_]{0,63}$/u.test(envelope.keyVersion)||
    typeof envelope.nonceHex!=='string'||!/^[A-F0-9]{24}$/u.test(envelope.nonceHex)||
    typeof envelope.tagHex!=='string'||!/^[A-F0-9]{32}$/u.test(envelope.tagHex)||
    typeof envelope.ciphertextBase64!=='string'||!envelope.ciphertextBase64.length||
    envelope.ciphertextBase64.length>Math.ceil(MAX_PLAINTEXT_BYTES/3)*4)blocked();
  const cipher=Buffer.from(envelope.ciphertextBase64,'base64');
  if(!cipher.length||cipher.length>MAX_PLAINTEXT_BYTES||
    cipher.toString('base64')!==envelope.ciphertextBase64)blocked();
  if(JSON.stringify(value)+'\n'!==wire)blocked();
  return bytes;
}

/**
 * Provision a dedicated short-lived Vault Auth user session under private
 * custody. At current project state zero Storage SELECT policies exist, so
 * actual reads MUST deny until a separately audited, narrow RLS policy is
 * authorized and deployed. Never interpret HTTP 400 as a valid denial proof.
 */
export function createPrivateVaultAuthUserStorageReaderV1(rawConfig){
  const c=snapshot(rawConfig,FIELDS);
  assertIsolatedVaultEnvironmentV1(c.environment);
  if(c.environment.SYNTRAKE_VAULT_READER_MODE!==READER_MODE||
    typeof c.vaultProjectRef!=='string'||!REF.test(c.vaultProjectRef)||
    typeof c.privateBucket!=='string'||!BUCKET.test(c.privateBucket)||
    typeof c.publishableKey!=='string'||!PUBLIC.test(c.publishableKey)||
    typeof c.authUserJwtFilePath!=='string'||!isAbsolute(c.authUserJwtFilePath)||
    typeof globalThis.fetch!=='function')blocked();
  const host=`${c.vaultProjectRef}.supabase.co`;

  return Object.freeze({
    async readSealedObjectV1(untrusted){
      const target=snapshot(untrusted,REQUEST_FIELDS);
      if(typeof target.privateObjectLocator!=='string'||!HEX.test(target.privateObjectLocator)||
        typeof target.expectedCiphertextSha256Hex!=='string'||
        !HEX.test(target.expectedCiphertextSha256Hex))blocked();
      const jwt=checkVaultJwt(readOwnerOnlyJwt(c.authUserJwtFilePath),c.vaultProjectRef);
      const url=`https://${host}/storage/v1/object/authenticated/${encodeURIComponent(c.privateBucket)}/sealed-v1/${target.privateObjectLocator}.json`;
      const endpoint=new URL(url);
      if(endpoint.protocol!=='https:'||endpoint.hostname!==host||endpoint.port!==''||
        endpoint.username!==''||endpoint.password!==''||
        endpoint.search!==''||endpoint.hash!=='')blocked();
      const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8000);
      let reader;
      try{
        const response=await globalThis.fetch(url,{
          method:'GET',
          headers:{apikey:c.publishableKey,authorization:'Bearer '+jwt,accept:'application/octet-stream'},
          redirect:'manual',cache:'no-store',signal:ctl.signal,
        });
        if(!response||response.status!==200||
          !response.body||typeof response.body.getReader!=='function')blocked();
        reader=response.body.getReader();
        const chunks=[];let size=0;
        while(true){
          const item=await reader.read();
          if(item.done)break;
          if(!(item.value instanceof Uint8Array))blocked();
          size+=item.value.length;
          if(size>MAX_RESPONSE_BYTES)blocked();
          chunks.push(Buffer.from(item.value));
        }
        return assertEncryptedEnvelope(Buffer.concat(chunks,size),
          target.expectedCiphertextSha256Hex);
      }catch{blocked();}
      finally{
        clearTimeout(timer);
        if(reader){try{reader.releaseLock();}catch{}}
      }
    },
  });
}
