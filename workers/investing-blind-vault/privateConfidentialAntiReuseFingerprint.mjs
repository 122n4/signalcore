/**
 * RL-9C confidential anti-reuse: derive stable HMAC of exact secret bytes
 * with an independent Vault-host-only pepper. Never use raw SHA-256,
 * tenant-salted digests (which permit cross-tenant reseal), or a random
 * per-seal salt in this fingerprint: duplicates MUST collide.
 *
 * The 32-byte V1 pepper must be backed up and held outside Supabase/Next,
 * separate from the AES-GCM encryption key. Version rotation requires a
 * complete independent reindex before it can authorize a new seal.
 *
 * Does NOT authorize upload, reveal, metadata writes or decryption.
 */
import { createHmac } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { assertIsolatedVaultEnvironmentV1 } from './isolatedServer.mjs';

const DOMAIN=Buffer.from('SYNTRAKE:RL9C:CONFIDENTIAL_ANTI_REUSE:V1\n','utf8');
const FIELDS=['environment','secretHmacKeyFilePath','hmacKeyVersion'];
const VERSION='VAULT_HMAC_V1';
const MAX_BYTES=8*1024*1024;
function blocked(){throw Error('VAULT_UNAVAILABLE');}
function snapshot(raw){
  try {
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||
      (Object.getPrototypeOf(raw)!==Object.prototype &&
        Object.getPrototypeOf(raw)!==null))blocked();
    const keys=Reflect.ownKeys(raw),desc=Object.getOwnPropertyDescriptors(raw);
    if(keys.length!==FIELDS.length||keys.some(k=>typeof k!=='string'||!FIELDS.includes(k)))blocked();
    const out=Object.create(null);
    for(const key of FIELDS){
      if(!desc[key]?.enumerable||!('value' in desc[key]))blocked();
      out[key]=desc[key].value;
    }
    return out;
  }catch{blocked();}
}
function loadSecretPepper(rawPath) {
  if(process.platform!=='linux'||typeof process.getuid!=='function'||
    typeof rawPath!=='string'||!isAbsolute(rawPath))blocked();
  const filename=resolve(rawPath),cwd=resolve(process.cwd());
  if(filename===cwd||filename.startsWith(cwd+sep))blocked();
  let fd;const bytes=Buffer.alloc(33);
  try {
    for(let dir=dirname(filename);;){
      const st=lstatSync(dir);
      if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o022)!==0||
        (st.uid!==0&&st.uid!==process.getuid()))blocked();
      const parent=dirname(dir);if(parent===dir)break;dir=parent;
    }
    fd=openSync(filename,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const st=fstatSync(fd);
    if(!st.isFile()||st.nlink!==1||st.uid!==process.getuid()||
      (st.mode&0o777)!==0o600||st.size!==32)blocked();
    if(readSync(fd,bytes,0,bytes.length,0)!==32||
      fstatSync(fd).size!==32)blocked();
    return Buffer.from(bytes.subarray(0,32));
  }catch{blocked();}
  finally{
    bytes.fill(0);
    if(fd!==undefined){try{closeSync(fd);}catch{}}
  }
}

/** Return bytea-compatible HMAC fingerprint, never the HMAC key or plaintext. */
export function createConfidentialAntiReuseFingerprintV1(configRaw){
  const c=snapshot(configRaw);
  assertIsolatedVaultEnvironmentV1(c.environment);
  if(c.environment.SYNTRAKE_VAULT_HMAC_MODE!==VERSION||
     c.hmacKeyVersion!==VERSION||
     typeof c.secretHmacKeyFilePath!=='string'||!isAbsolute(c.secretHmacKeyFilePath))blocked();
  return Object.freeze({
    fingerprintExactCanonicalPlaintextV1(untrustedPlaintext){
      if(!(untrustedPlaintext instanceof Uint8Array)||
        untrustedPlaintext.byteLength<1||
        untrustedPlaintext.byteLength>MAX_BYTES)blocked();
      const pepper=loadSecretPepper(c.secretHmacKeyFilePath);
      try{
        const mac=createHmac('sha256',pepper);
        mac.update(DOMAIN);
        mac.update(untrustedPlaintext);
        return mac.digest();
      }catch{blocked();}
      finally{pepper.fill(0);}
    },
  });
}
