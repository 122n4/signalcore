/**
 * RL-9C private worker: SYNTHETIC-ONLY read-only ciphertext transport.
 * NOT a production Storage authorization, seal, decrypt, embargo, anti-reuse,
 * or reveal boundary. The injectable fetcher is a test hook, not live egress.
 * Supabase private /object/authenticated requires a valid Authorization
 * context: a modern sb_secret_* in apikey alone proves none.
 *
 * No ordinary app/server API can import this module or expose its methods.
 * A future real isolated worker must prove a separately committed one-shot
 * authorization BEFORE calling readSealedObjectV1. A content hash is integrity
 * evidence, NOT permission to read, and a successful read is NOT a reveal.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readSync,
} from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { assertIsolatedVaultEnvironmentV1 } from './isolatedServer.mjs';

const REF=/^[a-z]{20}$/u;
const BUCKET=/^[a-z][a-z0-9-]{2,62}$/u;
const DIGEST=/^[A-F0-9]{64}$/u;
const SECRET=/^sb_secret_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}$/u;
const MAX_BYTES=8*1024*1024;
const TIMEOUT_MS=8000;
const FIELD_NAMES=['environment','vaultProjectRef','privateBucket','credentialFilePath','fetcher'];
const REHEARSAL_MODE='ISOLATED_REHEARSAL_V1';

function blocked(){throw Error('VAULT_UNAVAILABLE');}
function snapshot(value,fields){
  try{
    if(!value||typeof value!=='object'||Array.isArray(value)||
      (Object.getPrototypeOf(value)!==Object.prototype &&
        Object.getPrototypeOf(value)!==null))blocked();
    const own=Reflect.ownKeys(value);
    if(own.length!==fields.length||
      own.some(k=>typeof k!=='string'||!fields.includes(k)))blocked();
    const desc=Object.getOwnPropertyDescriptors(value);
    const output=Object.create(null);
    for(const field of fields){
      if(!desc[field]?.enumerable||!('value' in desc[field]))blocked();
      output[field]=desc[field].value;
    }
    return output;
  }catch{blocked();}
}
/** Pin a private file descriptor, rejecting symlinks, loose permissions and links. */
function secretFile(path){
  if(process.platform!=='linux'||typeof process.getuid!=='function'||
    typeof path!=='string'||!isAbsolute(path))blocked();
  const resolved=resolve(path);
  const cwd=resolve(process.cwd());
  if(resolved===cwd||resolved.startsWith(cwd+sep))blocked();
  let fd;
  try{
    for(let dir=dirname(resolved);;){
      const st=lstatSync(dir);
      if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o022)!==0||
        (st.uid!==0&&st.uid!==process.getuid()))blocked();
      const parent=dirname(dir);
      if(parent===dir)break;
      dir=parent;
    }
    fd=openSync(resolved,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const st=fstatSync(fd);
    if(!st.isFile()||st.nlink!==1||st.uid!==process.getuid()||
      (st.mode&0o777)!==0o600||st.size<30||st.size>256)blocked();
    const buf=Buffer.alloc(st.size+1);
    if(readSync(fd,buf,0,buf.length,0)!==st.size||
      fstatSync(fd).size!==st.size)blocked();
    const key=buf.subarray(0,st.size).toString('utf8').replace(/\r?\n$/u,'');
    buf.fill(0);
    if(!SECRET.test(key))blocked();
    return key;
  }catch{blocked();}finally{if(fd!==undefined){try{closeSync(fd)}catch{}}}
}

/**
 * Refuse arbitrary content even when its SHA matches an untrusted assertion.
 * This does not validate the AES-GCM tag (only the isolated decryptor can).
 * It ensures this reader cannot be repurposed as a generic plaintext endpoint.
 */
function assertEncryptedEnvelopeBytes(bytes){
  try{
    const encoded=bytes.toString('utf8');
    if(!encoded.endsWith('\n')||encoded.slice(0,-1).includes('\n')||
      encoded.includes('\r')||!Buffer.from(encoded,'utf8').equals(bytes))blocked();
    const parsed=JSON.parse(encoded);
    const e=snapshot(parsed,[
      'schemaVersion','algorithm','keyVersion','nonceHex','ciphertextBase64','tagHex',
    ]);
    if(e.schemaVersion!=='BLIND_TRUTH_VAULT_ENVELOPE_V1'||
      e.algorithm!=='AES_256_GCM'||
      typeof e.keyVersion!=='string'||
      !/^[A-Z][A-Z0-9_]{0,63}$/u.test(e.keyVersion)||
      typeof e.nonceHex!=='string'||!/^[A-F0-9]{24}$/u.test(e.nonceHex)||
      typeof e.tagHex!=='string'||!/^[A-F0-9]{32}$/u.test(e.tagHex)||
      typeof e.ciphertextBase64!=='string'||e.ciphertextBase64.length===0||
      e.ciphertextBase64.length>MAX_BYTES)blocked();
    const cipher=Buffer.from(e.ciphertextBase64,'base64');
    if(cipher.length===0||cipher.toString('base64')!==e.ciphertextBase64)blocked();
    // No arbitrary whitespace or hidden second JSON document.
    if(JSON.stringify(parsed)+'\n'!==encoded)blocked();
  }catch{blocked();}
}

function requestUrl(projectRef,bucket,locator){
  return `https://${projectRef}.supabase.co/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/sealed-v1/${locator}.json`;
}
function readParameters(raw){
  const value=snapshot(raw,['privateObjectLocator','expectedCiphertextSha256Hex']);
  if(typeof value.privateObjectLocator!=='string'||!DIGEST.test(value.privateObjectLocator)||
    typeof value.expectedCiphertextSha256Hex!=='string'||
    !DIGEST.test(value.expectedCiphertextSha256Hex))blocked();
  return value;
}

/**
 * A SYNTHETIC ciphertext-only I/O rehearsal. Never pass it an ordinary
 * Investing credential or a browser/HTTP-provided locator. Real Storage
 * authorization, committed-burn proof and custody are unavailable today.
 *
 * The user-controlled `fetcher` hook exists ONLY for offline transport tests.
 */
export function createPrivateSupabaseCiphertextReaderV1(raw){
  const config=snapshot(raw,FIELD_NAMES);
  assertIsolatedVaultEnvironmentV1(config.environment);
  // An injected HTTP transport is NEVER an operational private Storage
  // client. Production must use a separate adapter with Vault-issued JWT,
  // verified custody and provider-side Storage/RLS admission evidence.
  if(config.environment.SYNTRAKE_VAULT_SYNTHETIC_STORE_MODE!==REHEARSAL_MODE)blocked();
  if(typeof config.vaultProjectRef!=='string'||!REF.test(config.vaultProjectRef)||
    typeof config.privateBucket!=='string'||!BUCKET.test(config.privateBucket)||
    typeof config.fetcher!=='function')blocked();
  const expectedHost=`${config.vaultProjectRef}.supabase.co`;

  return Object.freeze({
    async readSealedObjectV1(untrusted){
      const {privateObjectLocator,expectedCiphertextSha256Hex}=readParameters(untrusted);
      // Load the secret at use time: no persistent key cache, but keep every
      // outbound request constrained to the ONE Vault hostname below.
      const key=secretFile(config.credentialFilePath);
      const url=requestUrl(config.vaultProjectRef,config.privateBucket,privateObjectLocator);
      const parsed=new URL(url);
      if(parsed.protocol!=='https:'||parsed.hostname!==expectedHost||
        parsed.port!==''||parsed.username!==''||parsed.password!==''||
        parsed.search!==''||parsed.hash!=='')blocked();

      const abort=new AbortController();
      const timeout=setTimeout(()=>abort.abort(),TIMEOUT_MS);
      try{
        const reply=await config.fetcher(url,{
          method:'GET',
          headers:{apikey:key,accept:'application/octet-stream'},
          signal:abort.signal,
          redirect:'manual',
          cache:'no-store',
        });
        if(!reply||reply.status!==200||!reply.body?.getReader){
          try{await reply?.body?.cancel?.();}catch{}
          blocked();
        }
        const reader=reply.body.getReader();
        let chunks=[],size=0;
        while(true){
          const next=await reader.read();
          if(next.done)break;
          if(!next.value||!(next.value instanceof Uint8Array))blocked();
          size+=next.value.byteLength;
          if(size>MAX_BYTES){try{await reader.cancel();}catch{}blocked();}
          chunks.push(Buffer.from(next.value));
        }
        if(size===0)blocked();
        const bytes=Buffer.concat(chunks,size);
        const actual=createHash('sha256').update(bytes).digest();
        const expected=Buffer.from(expectedCiphertextSha256Hex,'hex');
        if(actual.length!==expected.length||!timingSafeEqual(actual,expected))blocked();
        assertEncryptedEnvelopeBytes(bytes);
        // Format and SHA-256 validated. AES-GCM authenticity, burn authority
        // and permission to reveal are NOT granted by this transport.
        return bytes;
      }catch{blocked();}finally{clearTimeout(timeout);}
    },
  });
}
