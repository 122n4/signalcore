/**
 * RL-9C synthetic-only end-to-end bridge: Ed25519 fixture assertion
 * -> durable local burn BEFORE remote Vault ciphertext read.
 *
 * THIS IS NOT A REAL VAULT AUTHORIZATION FLOW. No deployed signer checks
 * committed PG rows; there is no real secret/reveal/evaluation capability.
 * Never expose via mTLS, app routes, Edge functions or browser.
 * Only disposable synthetic fixtures are permitted.
 */
import { createHash, createPublicKey, timingSafeEqual, verify } from 'node:crypto';
import {
  constants, closeSync, fsyncSync, lstatSync, mkdirSync,
  openSync, realpathSync, writeFileSync,
} from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { assertIsolatedVaultEnvironmentV1 } from './isolatedServer.mjs';
import { createPrivateSupabaseCiphertextReaderV1 } from './privateSupabaseCiphertextReader.mjs';

const STORE_MODE='ISOLATED_REHEARSAL_V1';
const DOMAIN='SYNTRAKE:RL9_SYNTHETIC_REMOTE_COMMITTED_BURN:V1\n';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const HEX=/^[A-F0-9]{64}$/u;
const BASE64=/^[A-Za-z0-9+/]{86}==$/u;
const MAX_AGE_MS=60000;
const FUTURE_SKEW_MS=5000;
const CLAIM_FIELDS=[
  'schemaVersion','audience','tenantId','registrationHashHex',
  'evaluationHashHex','revealStartedEventHashHex','burnReservationId',
  'burnState','privateObjectLocator','expectedCiphertextSha256Hex',
  'issuedAtMs','expiresAtMs',
];
const CONFIG_FIELDS=[
  'environment','storageMode','rootDirectory',
  'trustedSignerPublicKeyDer','trustedSignerPublicKeySha256Hex','transportConfig',
];
const O_EXCL=constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW;
const O_DIR=constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW;
const NONCE='SYNTRAKE:RL9_SYNTHETIC_REMOTE_BURN:V1\n';

function blocked(){throw Error('VAULT_UNAVAILABLE');}
function snapshot(untrusted,fields){
  try{
    if(!untrusted||typeof untrusted!=='object'||Array.isArray(untrusted)||
      (Object.getPrototypeOf(untrusted)!==Object.prototype &&
       Object.getPrototypeOf(untrusted)!==null))blocked();
    const keys=Reflect.ownKeys(untrusted);
    if(keys.length!==fields.length||keys.some(k=>typeof k!=='string'||!fields.includes(k)))blocked();
    const desc=Object.getOwnPropertyDescriptors(untrusted);
    const own=Object.create(null);
    for(const field of fields){
      if(!desc[field]?.enumerable||!('value' in desc[field]))blocked();
      own[field]=desc[field].value;
    }
    return Object.freeze(own);
  }catch{blocked();}
}
function claimsV1(raw){
  const x=snapshot(raw,CLAIM_FIELDS);
  if(x.schemaVersion!=='RL9_SYNTHETIC_REMOTE_COMMITTED_BURN_V1'||
    x.audience!=='ISOLATED_VAULT_SYNTHETIC_REMOTE_TEST_ONLY'||
    x.burnState!=='BURNED_NOT_AUTHORIZED'||
    typeof x.tenantId!=='string'||!UUID.test(x.tenantId)||
    typeof x.burnReservationId!=='string'||!UUID.test(x.burnReservationId)||
    ['registrationHashHex','evaluationHashHex','revealStartedEventHashHex',
      'privateObjectLocator','expectedCiphertextSha256Hex'].some(
      name=>typeof x[name]!=='string'||!HEX.test(x[name]))||
    !Number.isSafeInteger(x.issuedAtMs)||!Number.isSafeInteger(x.expiresAtMs)||
    x.issuedAtMs<0||x.expiresAtMs<=x.issuedAtMs||
    x.expiresAtMs-x.issuedAtMs>MAX_AGE_MS)blocked();
  return Object.freeze(Object.fromEntries(CLAIM_FIELDS.map(k=>[k,x[k]])));
}
/** Fixture signer only; this function is NOT a PG-backed trusted issuer. */
export function syntheticRemoteBurnSigningBytesV1(rawClaims){
  return Buffer.from(DOMAIN+JSON.stringify(claimsV1(rawClaims)),'utf8');
}
function secureDirectory(dir){
  try{
    const st=lstatSync(dir);
    if(!st.isDirectory()||st.isSymbolicLink()||realpathSync(dir)!==dir||
      (st.mode&0o777)!==0o700||typeof process.getuid!=='function'||
      st.uid!==process.getuid())blocked();
  }catch{blocked();}
}
function mkdirExclusive(dir){
  try{mkdirSync(dir,{mode:0o700});}catch(e){
    if(e?.code!=='EEXIST')blocked();
  }
  secureDirectory(dir);
}
function syncDirectory(dir){
  let fd;
  try{fd=openSync(dir,O_DIR);fsyncSync(fd);}catch{blocked();}
  finally{if(fd!==undefined)closeSync(fd);}
}
function burn(dir,base,payload){
  let fd;
  try{
    fd=openSync(join(dir,base+'.burned'),O_EXCL,0o600);
    writeFileSync(fd,payload,'ascii');
    fsyncSync(fd);
  }catch{blocked();}
  finally{if(fd!==undefined)closeSync(fd);}
  syncDirectory(dir);
}

export function createSignedSyntheticRemoteVaultConsumerV1(untrusted){
  const c=snapshot(untrusted,CONFIG_FIELDS);
  assertIsolatedVaultEnvironmentV1(c.environment);
  if(process.platform!=='linux'||c.storageMode!==STORE_MODE||
    c.environment.SYNTRAKE_VAULT_SYNTHETIC_STORE_MODE!==STORE_MODE||
    typeof c.rootDirectory!=='string'||!isAbsolute(c.rootDirectory)||
    typeof c.trustedSignerPublicKeySha256Hex!=='string'||
    !HEX.test(c.trustedSignerPublicKeySha256Hex)||
    !Buffer.isBuffer(c.trustedSignerPublicKeyDer)||
    c.trustedSignerPublicKeyDer.length<32||c.trustedSignerPublicKeyDer.length>512)blocked();
  const root=resolve(c.rootDirectory), cwd=resolve(process.cwd());
  if(root===cwd||root.startsWith(cwd+sep))blocked();
  secureDirectory(root);
  const evaluations=join(root,'remote-evaluation-burns');
  const objects=join(root,'remote-object-burns');
  mkdirExclusive(evaluations);
  mkdirExclusive(objects);
  syncDirectory(root);

  let key;
  try{
    const raw=Buffer.from(c.trustedSignerPublicKeyDer);
    const actual=createHash('sha256').update(raw).digest();
    const expected=Buffer.from(c.trustedSignerPublicKeySha256Hex,'hex');
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))blocked();
    key=createPublicKey({key:raw,format:'der',type:'spki'});
    if(key.asymmetricKeyType!=='ed25519')blocked();
  }catch{blocked();}

  // The low-level transport never has its own read authorization. This
  // facade alone restricts it to signed synthetic fixture use.
  const transport=createPrivateSupabaseCiphertextReaderV1(c.transportConfig);
  return Object.freeze({
    async consumeSignedSyntheticRemoteEnvelopeOnceV1(untrustedToken){
      const token=snapshot(untrustedToken,['claims','signatureBase64']);
      const claims=claimsV1(token.claims);
      if(typeof token.signatureBase64!=='string'||!BASE64.test(token.signatureBase64))blocked();
      const signature=Buffer.from(token.signatureBase64,'base64');
      if(signature.length!==64||signature.toString('base64')!==token.signatureBase64)blocked();
      const now=Date.now();
      if(claims.issuedAtMs>now+FUTURE_SKEW_MS||claims.expiresAtMs<=now)blocked();
      try{if(!verify(null,syntheticRemoteBurnSigningBytesV1(claims),key,signature))blocked();}
      catch{blocked();}
      secureDirectory(root);secureDirectory(evaluations);secureDirectory(objects);

      // EVERY resubmission is consumed, even after a remote failure/crash.
      // Two processes racing the same evaluation/locator cannot both read.
      burn(evaluations,claims.evaluationHashHex,
        NONCE+'event='+claims.revealStartedEventHashHex+'\n');
      const objectBurn=createHash('sha256').update(NONCE)
        .update(claims.privateObjectLocator).digest('hex').toUpperCase();
      burn(objects,objectBurn,NONCE+'evaluation='+claims.evaluationHashHex+'\n');

      const envelopeBytes=await transport.readSealedObjectV1({
        privateObjectLocator:claims.privateObjectLocator,
        expectedCiphertextSha256Hex:claims.expectedCiphertextSha256Hex,
      });
      // No decrypt, plaintext, scientific score, REST endpoint or real ALLOW.
      return Object.freeze({status:'SYNTHETIC_REMOTE_CONSUMED_ONCE',
        encryptedEnvelopeBytes:envelopeBytes});
    },
  });
}
