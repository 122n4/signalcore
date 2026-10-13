import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createCommittedSyntheticPgBurnIssuerV1,
} from '../workers/investing-blind-vault/privateCommittedSyntheticPgBurnIssuer.mjs';
import {
  syntheticRemoteBurnSigningBytesV1,
} from '../workers/investing-blind-vault/privateSignedSyntheticRemoteConsume.mjs';

const UUIDS={
  tenantId:'11111111-1111-4111-8111-111111111111',
  principalId:'22222222-2222-4222-8222-222222222222',
  tenantMembershipId:'33333333-3333-4333-8333-333333333333',
  researchInvestigationId:'44444444-4444-4444-8444-444444444444',
};
const identity={
  ...UUIDS,evaluationHashHex:'A'.repeat(64),
  privateObjectLocator:'B'.repeat(64),
  expectedCiphertextSha256Hex:'C'.repeat(64),
};
const row={
  reservation_id:'55555555-5555-4555-8555-555555555555',
  reservation_state:'BURNED_NOT_AUTHORIZED',
  tenant_id:UUIDS.tenantId,
  principal_id:UUIDS.principalId,
  tenant_membership_id:UUIDS.tenantMembershipId,
  research_investigation_id:UUIDS.researchInvestigationId,
  registration_hash_hex:'D'.repeat(64),
  evaluation_hash_hex:identity.evaluationHashHex,
  event_hash_hex:'E'.repeat(64),
  event_state:'REVEAL_STARTED',
};
const env={
  SYNTRAKE_VAULT_WORKER_MODE:'ISOLATED_SECRET_VAULT_V1',
  SYNTRAKE_VAULT_SYNTHETIC_STORE_MODE:'ISOLATED_REHEARSAL_V1',
  SYNTRAKE_VAULT_ISSUER_MODE:'ISOLATED_REHEARSAL_V1',
};
function dbFake(proof:any=row,options:{role?:string;throwQuery?:boolean}={}){
  const statements:{sql:string;params:any[]|undefined}[]=[];
  let released=0,releaseDestroyed:any=null;
  return {
    statements,
    get released(){return released;},
    get releaseDestroyed(){return releaseDestroyed;},
    connect:async()=>({
      query:async(sql:string,params?:any[])=>{
        statements.push({sql,params});
        if(options.throwQuery&&sql.includes('from investing.research_blind_truth_consume_reservations_v1'))
          throw Error('DB_INTERNAL_SECRET');
        if(sql==='select current_user as effective_role')
          return {rows:[{effective_role:options.role??'investing_rl9_writer'}]};
        if(sql.includes('from investing.research_blind_truth_consume_reservations_v1'))
          return {rows:proof===null?[]:[proof]};
        return {rows:[]};
      },
      release:async(destroy?:boolean)=>{released++;releaseDestroyed=destroy??false;},
    }),
  };
}
async function fixture(run:(f:ReturnType<typeof build>)=>Promise<void>|void){
  const root=fs.mkdtempSync(path.join(homedir(),'.syntrake-rl9c-private-issuer-'));
  fs.chmodSync(root,0o700);
  try{await run(build(root));}finally{fs.rmSync(root,{recursive:true,force:true});}
}
function build(root:string){
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const signerPrivateKeyPath=path.join(root,'issuer-pkcs8.pem');
  fs.writeFileSync(signerPrivateKeyPath,
    privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600});
  const publicKeyDer=publicKey.export({format:'der',type:'spki'}) as Buffer;
  const signerPublicKeySha256Hex=createHash('sha256')
    .update(publicKeyDer).digest('hex').toUpperCase();
  const makeConfig=(database:any)=>({
    environment:env,issuerMode:'ISOLATED_REHEARSAL_V1',
    database,fixedIdentity:identity,signerPrivateKeyPath,signerPublicKeySha256Hex,
  });
  return {root,signerPrivateKeyPath,publicKey,publicKeyDer,makeConfig};
}

describe.skipIf(process.platform!=='linux')('RL-9C committed PG burn issuer — only synthetic signed authority',()=>{
  it('signs only after a fresh independent read-only PostgreSQL join and closes the transaction',()=>fixture(async f=>{
    const db=dbFake();
    const issuer=createCommittedSyntheticPgBurnIssuerV1(f.makeConfig(db));
    const token=await issuer.issueSignedSyntheticCommittedBurnV1();
    expect(token.claims).toMatchObject({
      schemaVersion:'RL9_SYNTHETIC_REMOTE_COMMITTED_BURN_V1',
      audience:'ISOLATED_VAULT_SYNTHETIC_REMOTE_TEST_ONLY',
      tenantId:UUIDS.tenantId,
      registrationHashHex:row.registration_hash_hex,
      evaluationHashHex:row.evaluation_hash_hex,
      revealStartedEventHashHex:row.event_hash_hex,
      burnReservationId:row.reservation_id,
      burnState:'BURNED_NOT_AUTHORIZED',
      privateObjectLocator:identity.privateObjectLocator,
      expectedCiphertextSha256Hex:identity.expectedCiphertextSha256Hex,
    });
    const signature=Buffer.from(token.signatureBase64,'base64');
    expect(verify(null,syntheticRemoteBurnSigningBytesV1(token.claims),
      f.publicKey,signature)).toBe(true);
    expect(db.statements[0]?.sql).toBe('begin isolation level repeatable read read only');
    expect(db.statements.map(s=>s.sql)).toContain('set local role investing_rl9_writer');
    const joined=db.statements.find(s=>s.sql.includes('from investing.research_blind_truth_consume_reservations_v1'));
    expect(joined).toBeDefined();
    expect(joined!.sql).toContain('join investing.research_blind_truth_evaluations_scientific_identities');
    expect(joined!.sql).toContain('join investing.research_blind_truth_registrations_scientific_identities');
    expect(joined!.sql).toContain('not exists (');
    expect(joined!.sql).toContain("terminal.event_state in ('REVEAL_COMPLETED','REVEAL_FAILED_CLOSED')");
    expect(joined!.params).toEqual([
      UUIDS.tenantId,UUIDS.principalId,UUIDS.tenantMembershipId,
      UUIDS.researchInvestigationId,identity.evaluationHashHex,
    ]);
    expect(db.statements.at(-1)?.sql).toBe('rollback');
    expect(db.released).toBe(1);
    expect(db.releaseDestroyed).toBe(false);
    expect(JSON.stringify(token)).not.toContain('signer-pkcs8');
  }));

  it('does not sign or read private key without the committed PostgreSQL row',()=>fixture(async f=>{
    const db=dbFake(null);
    const issuer=createCommittedSyntheticPgBurnIssuerV1(f.makeConfig(db));
    await expect(issuer.issueSignedSyntheticCommittedBurnV1())
      .rejects.toThrow('RL9C_ISSUER_BLOCKED');
    expect(db.statements.at(-1)?.sql).toBe('rollback');
    expect(db.released).toBe(1);
  }));

  it('rejects wrong identity, event, role, missing reservation and divergent row shape',()=>fixture(async f=>{
    const invalid=[
      {...row,tenant_id:'66666666-6666-4666-8666-666666666666'},
      {...row,event_state:'REVEAL_FAILED_CLOSED'},
      {...row,reservation_state:'PENDING'},
      {...row,evaluation_hash_hex:'F'.repeat(64)},
      {...row,registration_hash_hex:'lowercase'},
      {...row,extraProof:'caller'},
      {...row,reservation_id:'not-uuid'},
    ];
    for(const record of invalid){
      const db=dbFake(record);
      await expect(createCommittedSyntheticPgBurnIssuerV1(f.makeConfig(db))
        .issueSignedSyntheticCommittedBurnV1()).rejects.toThrow('RL9C_ISSUER_BLOCKED');
      expect(db.released).toBe(1);
    }
    const role=dbFake(row,{role:'service_role'});
    await expect(createCommittedSyntheticPgBurnIssuerV1(f.makeConfig(role))
      .issueSignedSyntheticCommittedBurnV1()).rejects.toThrow('RL9C_ISSUER_BLOCKED');
    expect(role.statements.some(s=>s.sql.includes('from investing.research_blind_truth_consume_reservations_v1')))
      .toBe(false);
  }));

  it('never signs if PostgreSQL transport errors or signer is missing/mismatched',()=>fixture(async f=>{
    const err=dbFake(row,{throwQuery:true});
    await expect(createCommittedSyntheticPgBurnIssuerV1(f.makeConfig(err))
      .issueSignedSyntheticCommittedBurnV1()).rejects.toThrow('RL9C_ISSUER_BLOCKED');
    expect(err.released).toBe(1);
    const wrong=createCommittedSyntheticPgBurnIssuerV1({
      ...f.makeConfig(dbFake()),signerPublicKeySha256Hex:'F'.repeat(64),
    });
    await expect(wrong.issueSignedSyntheticCommittedBurnV1())
      .rejects.toThrow('RL9C_ISSUER_BLOCKED');
    fs.chmodSync(f.signerPrivateKeyPath,0o644);
    await expect(createCommittedSyntheticPgBurnIssuerV1(f.makeConfig(dbFake()))
      .issueSignedSyntheticCommittedBurnV1()).rejects.toThrow('RL9C_ISSUER_BLOCKED');
  }));

  it('rejects arbitrary config, real issuer mode and copied ordinary app secrets',()=>fixture(async f=>{
    const conf=f.makeConfig(dbFake());
    expect(()=>createCommittedSyntheticPgBurnIssuerV1({
      ...conf,issuerMode:'REAL_VAULT',
    })).toThrow('RL9C_ISSUER_BLOCKED');
    expect(()=>createCommittedSyntheticPgBurnIssuerV1({
      ...conf,environment:{...env,SUPABASE_SERVICE_ROLE_KEY:'ordinary-test'},
    })).toThrow('MISSING_VAULT_CAPABILITY');
    expect(()=>createCommittedSyntheticPgBurnIssuerV1({
      ...conf,issuerAuthority:'ALLOW',
    })).toThrow('RL9C_ISSUER_BLOCKED');
    expect(()=>createCommittedSyntheticPgBurnIssuerV1({
      ...conf,fixedIdentity:{...identity,privateObjectLocator:'../../confidential'},
    })).toThrow('RL9C_ISSUER_BLOCKED');
    const poisoned={...conf};
    let accessed=0;
    Object.defineProperty(poisoned,'database',{enumerable:true,get(){accessed++;throw Error('PRIVATE');}});
    expect(()=>createCommittedSyntheticPgBurnIssuerV1(poisoned))
      .toThrow('RL9C_ISSUER_BLOCKED');
    expect(accessed).toBe(0);
  }));

  it('has no live route and cannot be imported by the ordinary application',()=>fixture(async f=>{
    const issuer=createCommittedSyntheticPgBurnIssuerV1(f.makeConfig(dbFake()));
    expect(Object.keys(issuer)).toEqual(['issueSignedSyntheticCommittedBurnV1']);
    const server=fs.readFileSync(path.join(process.cwd(),'workers/investing-blind-vault/isolatedServer.mjs'),'utf8');
    const app=fs.readFileSync(path.join(process.cwd(),'lib/investing/research/researchExecutionService.ts'),'utf8');
    expect(server).not.toContain('privateCommittedSyntheticPgBurnIssuer');
    expect(app).not.toContain('privateCommittedSyntheticPgBurnIssuer');
  }));
});
