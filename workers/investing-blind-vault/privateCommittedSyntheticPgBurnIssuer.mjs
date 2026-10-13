/**
 * RL-9C — private PostgreSQL committed-burn attestation issuer, SYNTHETIC ONLY.
 *
 * A separate READ-ONLY PostgreSQL transaction must witness the fully joined,
 * committed REVEAL_STARTED event and durable BURNED_NOT_AUTHORIZED reservation.
 * No caller-supplied token, event or hash is taken as database evidence.
 *
 * This is NOT a production secret-reveal grant. There is no real Vault signer
 * identity, embargo authorization, isolated key custody, key rotation or live
 * evaluation. The only issued audience is strictly fixture-scoped.
 */
import { createHash, createPrivateKey, createPublicKey, sign, timingSafeEqual } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { assertIsolatedVaultEnvironmentV1 } from './isolatedServer.mjs';
import { syntheticRemoteBurnSigningBytesV1 } from './privateSignedSyntheticRemoteConsume.mjs';

const MODE='ISOLATED_REHEARSAL_V1';
const HEX=/^[A-F0-9]{64}$/u;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const CONFIG_KEYS=['environment','issuerMode','database','fixedIdentity',
  'signerPrivateKeyPath','signerPublicKeySha256Hex'];
const ID_KEYS=['tenantId','principalId','tenantMembershipId','researchInvestigationId',
  'evaluationHashHex','privateObjectLocator','expectedCiphertextSha256Hex'];
const ROW_KEYS=['reservation_id','reservation_state','tenant_id','principal_id',
  'tenant_membership_id','research_investigation_id','registration_hash_hex',
  'evaluation_hash_hex','event_hash_hex','event_state'];
const PROOF_SQL=`
select r.reservation_id::text as reservation_id,
 r.reservation_state, r.tenant_id::text as tenant_id,
 r.principal_id::text as principal_id,
 r.tenant_membership_id::text as tenant_membership_id,
 r.research_investigation_id::text as research_investigation_id,
 e.registration_hash_hex, r.evaluation_hash_hex,
 e.event_hash_hex, e.event_state
from investing.research_blind_truth_consume_reservations_v1 r
join investing.research_blind_truth_reveal_result_events_scientific_identities e
 on e.research_blind_truth_reveal_result_event_identity_id=r.started_event_identity_id
 and e.event_hash_hex=r.started_event_hash_hex
 and e.evaluation_identity_id=r.evaluation_identity_id
 and e.evaluation_hash_hex=r.evaluation_hash_hex
 and e.tenant_id=r.tenant_id and e.principal_id=r.principal_id
 and e.tenant_membership_id=r.tenant_membership_id
 and e.research_investigation_id=r.research_investigation_id
join investing.research_blind_truth_evaluations_scientific_identities v
 on v.research_blind_truth_evaluation_identity_id=r.evaluation_identity_id
 and v.evaluation_hash_hex=r.evaluation_hash_hex
 and v.registration_identity_id=e.registration_identity_id
 and v.registration_hash_hex=e.registration_hash_hex
 and v.tenant_id=r.tenant_id and v.principal_id=r.principal_id
 and v.tenant_membership_id=r.tenant_membership_id
 and v.research_investigation_id=r.research_investigation_id
join investing.research_blind_truth_registrations_scientific_identities reg
 on reg.research_blind_truth_registration_identity_id=e.registration_identity_id
 and reg.registration_hash_hex=e.registration_hash_hex
 and reg.tenant_id=r.tenant_id and reg.principal_id=r.principal_id
 and reg.tenant_membership_id=r.tenant_membership_id
 and reg.research_investigation_id=r.research_investigation_id
where r.tenant_id=$1::uuid and r.principal_id=$2::uuid
 and r.tenant_membership_id=$3::uuid and r.research_investigation_id=$4::uuid
 and r.evaluation_hash_hex=$5
 and r.reservation_state='BURNED_NOT_AUTHORIZED'
 and e.event_state='REVEAL_STARTED'
 and e.predecessor_event_identity_id is null
 and e.predecessor_event_hash_hex is null
 and not exists (
   select 1 from investing.research_blind_truth_reveal_result_events_scientific_identities terminal
   where terminal.evaluation_identity_id=r.evaluation_identity_id
    and terminal.tenant_id=r.tenant_id
    and terminal.event_state in ('REVEAL_COMPLETED','REVEAL_FAILED_CLOSED')
 )
`;
function blocked(){throw Error('RL9C_ISSUER_BLOCKED');}
function snapshot(o,fields){
  try{
    if(!o||typeof o!=='object'||Array.isArray(o)||
       (Object.getPrototypeOf(o)!==Object.prototype&&Object.getPrototypeOf(o)!==null))blocked();
    const own=Reflect.ownKeys(o),desc=Object.getOwnPropertyDescriptors(o),v=Object.create(null);
    if(own.length!==fields.length||own.some(k=>typeof k!=='string'||!fields.includes(k)))blocked();
    for(const k of fields){
      if(!desc[k]?.enumerable||!('value' in desc[k]))blocked();
      v[k]=desc[k].value;
    }
    return Object.freeze(v);
  }catch{blocked();}
}
function privateSigner(path,expectedHex){
  if(process.platform!=='linux'||typeof process.getuid!=='function'||
    typeof path!=='string'||!isAbsolute(path))blocked();
  const filename=resolve(path),cwd=resolve(process.cwd());
  if(filename===cwd||filename.startsWith(cwd+sep))blocked();
  let fd,keyMaterial;
  try{
    for(let dir=dirname(filename);;){
      const st=lstatSync(dir);
      if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o022)!==0||
        (st.uid!==0&&st.uid!==process.getuid()))blocked();
      if(dirname(dir)===dir)break;
      dir=dirname(dir);
    }
    fd=openSync(filename,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const st=fstatSync(fd);
    if(!st.isFile()||st.nlink!==1||st.uid!==process.getuid()||
       (st.mode&0o777)!==0o600||st.size<50||st.size>8192)blocked();
    keyMaterial=readFileSync(fd);
    if(keyMaterial.length!==st.size||fstatSync(fd).size!==st.size)blocked();
    const privateKey=createPrivateKey(keyMaterial);
    if(privateKey.asymmetricKeyType!=='ed25519')blocked();
    const spki=createPublicKey(privateKey).export({format:'der',type:'spki'});
    const actual=createHash('sha256').update(spki).digest();
    const expected=Buffer.from(expectedHex,'hex');
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))blocked();
    return privateKey;
  }catch{blocked();}
  finally{
    if(keyMaterial)keyMaterial.fill(0);
    if(fd!==undefined){try{closeSync(fd);}catch{}}
  }
}
function verifyRow(row,identity){
  const data=snapshot(row,ROW_KEYS);
  if(data.reservation_state!=='BURNED_NOT_AUTHORIZED'||data.event_state!=='REVEAL_STARTED'||
     typeof data.reservation_id!=='string'||!UUID.test(data.reservation_id)||
     typeof data.registration_hash_hex!=='string'||!HEX.test(data.registration_hash_hex)||
     typeof data.event_hash_hex!=='string'||!HEX.test(data.event_hash_hex)||
     data.tenant_id!==identity.tenantId||data.principal_id!==identity.principalId||
     data.tenant_membership_id!==identity.tenantMembershipId||
     data.research_investigation_id!==identity.researchInvestigationId||
     data.evaluation_hash_hex!==identity.evaluationHashHex)blocked();
  return data;
}

/**
 * Issuer has no request arguments. All IDs, object locator and expected SHA
 * are privately pinned in the isolated issuer config, not passed by caller.
 */
export function createCommittedSyntheticPgBurnIssuerV1(untrusted){
  const c=snapshot(untrusted,CONFIG_KEYS);
  assertIsolatedVaultEnvironmentV1(c.environment);
  if(c.issuerMode!==MODE||
    c.environment.SYNTRAKE_VAULT_SYNTHETIC_STORE_MODE!==MODE||
    c.environment.SYNTRAKE_VAULT_ISSUER_MODE!==MODE||
    process.platform!=='linux')blocked();
  const id=snapshot(c.fixedIdentity,ID_KEYS);
  if(['tenantId','principalId','tenantMembershipId','researchInvestigationId']
      .some(k=>typeof id[k]!=='string'||!UUID.test(id[k]))||
    ['evaluationHashHex','privateObjectLocator','expectedCiphertextSha256Hex']
      .some(k=>typeof id[k]!=='string'||!HEX.test(id[k]))||
    typeof c.signerPublicKeySha256Hex!=='string'||!HEX.test(c.signerPublicKeySha256Hex)||
    !c.database||typeof c.database.connect!=='function')blocked();

  return Object.freeze({
    async issueSignedSyntheticCommittedBurnV1(){
      let client=null,active=false,destroy=false,proof;
      try{
        client=await c.database.connect();
        if(!client||typeof client.query!=='function'||typeof client.release!=='function')blocked();
        await client.query('begin isolation level repeatable read read only');
        active=true;
        await client.query("set local statement_timeout = '5000ms'");
        await client.query("set local lock_timeout = '2000ms'");
        // Only on a disposable PostgreSQL 17 fixture. This role switch
        // cannot be used as production issuer IAM/custody attestation.
        await client.query('set local role investing_rl9_writer');
        const role=await client.query('select current_user as effective_role');
        if(role?.rows?.length!==1||
          role.rows[0]?.effective_role!=='investing_rl9_writer')blocked();
        const gucs=[
          ['tenant_id',id.tenantId],['principal_id',id.principalId],
          ['tenant_membership_id',id.tenantMembershipId],
          ['research_investigation_id',id.researchInvestigationId],
        ];
        for(const [name,value] of gucs){
          await client.query('select set_config($1,$2,true)',
            ['syntrake.investing.'+name,value]);
        }
        const rows=await client.query(PROOF_SQL,[
          id.tenantId,id.principalId,id.tenantMembershipId,
          id.researchInvestigationId,id.evaluationHashHex,
        ]);
        if(rows?.rows?.length!==1)blocked();
        proof=verifyRow(rows.rows[0],id);
        // A successful read-only transaction NEVER authorizes a real reveal.
        // Its result is a synthetic signed fixture claim only.
        await client.query('rollback');
        active=false;
      }catch{
        if(active&&client){
          try{await client.query('rollback');}catch{destroy=true;}
        }
        blocked();
      }finally{
        try{await client?.release(destroy);}catch{blocked();}
      }

      // Only after the independent PostgreSQL query has completed.
      const key=privateSigner(c.signerPrivateKeyPath,c.signerPublicKeySha256Hex);
      const issuedAtMs=Date.now();
      const claims={
        schemaVersion:'RL9_SYNTHETIC_REMOTE_COMMITTED_BURN_V1',
        audience:'ISOLATED_VAULT_SYNTHETIC_REMOTE_TEST_ONLY',
        tenantId:id.tenantId,
        registrationHashHex:proof.registration_hash_hex,
        evaluationHashHex:id.evaluationHashHex,
        revealStartedEventHashHex:proof.event_hash_hex,
        burnReservationId:proof.reservation_id,
        burnState:'BURNED_NOT_AUTHORIZED',
        privateObjectLocator:id.privateObjectLocator,
        expectedCiphertextSha256Hex:id.expectedCiphertextSha256Hex,
        issuedAtMs,expiresAtMs:issuedAtMs+30000,
      };
      try{
        const signatureBase64=sign(null,syntheticRemoteBurnSigningBytesV1(claims),key)
          .toString('base64');
        return Object.freeze({claims:Object.freeze(claims),signatureBase64});
      }catch{blocked();}
    },
  });
}
