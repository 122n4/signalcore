import { createHash } from "node:crypto";
import { chmodSync, linkSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { createConfidentialAntiReuseFingerprintV1 } from "../workers/investing-blind-vault/privateConfidentialAntiReuseFingerprint.mjs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

// Disposable PG17 ONLY. Never point this test at a remote Supabase project.
const connectionString = process.env.PG17_RECONCILIATION_URL || "";
const run = connectionString ? describe : describe.skip;
const workerId = "11111111-1111-4111-8111-111111111111";
const strangerId = "22222222-2222-4222-8222-222222222222";
const sealedName = "sealed-v1/" + "A".repeat(64) + ".json";
let pool: Pool;

function refuseRemoteDb(url: string) {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw Error("RL9C_VAULT_TEST_LOCAL_ONLY"); }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") throw Error("RL9C_VAULT_TEST_LOCAL_ONLY");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) throw Error("RL9C_VAULT_TEST_LOCAL_ONLY");
  if (parsed.search || parsed.hash) throw Error("RL9C_VAULT_TEST_LOCAL_ONLY");
}
const bootstrap = `
do $$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create schema if not exists auth;
create schema if not exists storage;
create or replace function auth.uid() returns uuid language sql stable
  as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create or replace function storage.allow_only_operation(text) returns boolean language sql stable
  as $$select current_setting('storage.operation',true)=$1$$;
create table storage.objects(
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null
);
alter table storage.objects enable row level security;
alter table storage.objects force row level security;
grant usage on schema storage, auth to authenticated, anon;
grant select on storage.objects to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
grant execute on function storage.allow_only_operation(text) to authenticated, anon;
`;

async function checkVisible(role: "authenticated" | "anon", subject: string | null, op: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role " + role);
    if (subject) await client.query("select set_config('request.jwt.claim.sub',$1,true)",[subject]);
    await client.query("select set_config('storage.operation',$1,true)", [op]);
    const r=await client.query<{name:string}>("select name from storage.objects order by name");
    await client.query("rollback");
    return r.rows.map(x=>x.name);
  } catch (e) {
    try { await client.query("rollback"); } catch {}
    throw e;
  } finally { client.release(); }
}

async function asVaultWriter(query: string, values: unknown[]=[]): Promise<unknown[]> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role syntrake_vault_writer");
    const out=await client.query(query,values);
    await client.query("commit");
    return out.rows;
  } catch(e) {
    try { await client.query("rollback"); } catch {}
    throw e;
  } finally {client.release();}
}

run("RL-9C — Vault-only schema, RLS, confidential anti-reuse + committed burn (real disposable PostgreSQL 17)", () => {
  beforeAll(async () => {
    refuseRemoteDb(connectionString);
    pool=new Pool({connectionString,max:4,connectionTimeoutMillis:3000});
    const version=await pool.query<{v:string}>("select current_setting('server_version') as v");
    if(typeof version.rows[0]?.v!=="string"||!version.rows[0].v.startsWith("17.")) throw Error("RL9C_VAULT_PG17_REQUIRED");
    await pool.query(bootstrap);
    const sql=readFileSync(path.join(process.cwd(),"vault/sql/rl9c_private_vault_boundary_v1.sql"),"utf8");
    await pool.query(sql);
    const tightened=readFileSync(path.join(process.cwd(),"vault/sql/rl9c_storage_burn_read_fence_v1.sql"),"utf8");
    await pool.query(tightened);
    await pool.query("insert into storage.objects(bucket_id,name) values ($1,$2),($3,$4),($5,$6)",[
      "syntrake-private-sealed",sealedName,
      "syntrake-private-sealed","sealed-v1/"+"B".repeat(64)+".json",
      "syntrake-private-canary","rl9c2b2c-isolation-canary-v1/"+"C".repeat(32)+".txt",
    ]);
  },30000);
  afterAll(async () => {if(pool)await pool.end();});

  it("defaults to no authorized worker and never admits anon/ordinary authenticated reads",async()=>{
    expect(await checkVisible("anon",null,"object.get_authenticated")).toEqual([]);
    expect(await checkVisible("authenticated",workerId,"object.get_authenticated")).toEqual([]);
    expect(await checkVisible("authenticated",strangerId,"object.get_authenticated")).toEqual([]);
    const guards=await pool.query<{relname:string;relrowsecurity:boolean;relforcerowsecurity:boolean}>(`
      select relname,relrowsecurity,relforcerowsecurity from pg_class
      where oid in ('syntrake_vault_private.worker_auth_enrollments_v1'::regclass,
                    'syntrake_vault_private.confidential_fingerprints_v1'::regclass,
                    'syntrake_vault_private.sealed_ciphertexts_v1'::regclass,
                    'syntrake_vault_private.reveal_burns_v1'::regclass)`);
    expect(guards.rows).toHaveLength(4);
    expect(guards.rows.every(x=>x.relrowsecurity&&x.relforcerowsecurity)).toBe(true);
  });

  it("requires enrolled identity AND committed tenant-bound burn before GET, with no cross-object reads",async()=>{
    await pool.query("insert into syntrake_vault_private.worker_auth_enrollments_v1(auth_user_id,enabled) values($1,true),($2,true)",[workerId,strangerId]);
    // Being enrolled is NEVER enough to read a ciphertext.
    expect(await checkVisible("authenticated",workerId,"object.get_authenticated")).toEqual([]);
    const fp=await asVaultWriter(
      "insert into syntrake_vault_private.confidential_fingerprints_v1(fingerprint_hmac,hmac_key_version) values($1,'VAULT_HMAC_V1') returning fingerprint_id",
      [Buffer.alloc(32,0x40)],
    ) as {fingerprint_id:string}[];
    const sealed=await asVaultWriter(`
      insert into syntrake_vault_private.sealed_ciphertexts_v1
      (fingerprint_id,tenant_id,registration_hash_hex,sealed_locator_hex,ciphertext_sha256_hex)
      values($1,$2,$3,$4,$5) returning sealed_id`,
      [fp[0]!.fingerprint_id,workerId,"D".repeat(64),"A".repeat(64),"E".repeat(64)],
    ) as {sealed_id:string}[];
    expect(await checkVisible("authenticated",workerId,"object.get_authenticated")).toEqual([]);
    const insertBurn=`
      insert into syntrake_vault_private.reveal_burns_v1
      (sealed_id,tenant_id,evaluation_hash_hex,reveal_started_hash_hex,reader_auth_user_id,access_expires_at)
      values($1,$2,$3,$4,$5,transaction_timestamp()+interval '30 seconds')`;
    // A nonmatching tenant is never able to commit a forged burn.
    await expect(asVaultWriter(insertBurn,
      [sealed[0]!.sealed_id,strangerId,"1".repeat(64),"2".repeat(64),workerId]))
      .rejects.toThrow();
    expect(await checkVisible("authenticated",workerId,"object.get_authenticated")).toEqual([]);
    await asVaultWriter(insertBurn,
      [sealed[0]!.sealed_id,workerId,"1".repeat(64),"2".repeat(64),workerId]);
    expect(await checkVisible("authenticated",workerId,"object.get_authenticated"))
      .toEqual([sealedName]);
    // Another enrolled Vault Auth user MUST NEVER inherit this burn.
    expect(await checkVisible("authenticated",strangerId,"object.get_authenticated")).toEqual([]);
    expect(await checkVisible("anon",workerId,"object.get_authenticated")).toEqual([]);
    for(const operation of ["object.list","object.sign","object.move","object.download",""]) {
      expect(await checkVisible("authenticated",workerId,operation)).toEqual([]);
    }
    await pool.query("update syntrake_vault_private.worker_auth_enrollments_v1 set enabled=false where auth_user_id=$1",[workerId]);
    expect(await checkVisible("authenticated",workerId,"object.get_authenticated")).toEqual([]);
    await pool.query("update syntrake_vault_private.worker_auth_enrollments_v1 set enabled=true where auth_user_id=$1",[workerId]);
  });

  it("does not grant app roles direct access to private anti-reuse or committed-burn tables",async()=>{
    const r=await pool.query<{role:string;table:string;can_select:boolean;can_insert:boolean}>(`
      select role.r as role, tab.t as table,
             has_table_privilege(role.r,tab.t,'SELECT') as can_select,
             has_table_privilege(role.r,tab.t,'INSERT') as can_insert
      from (values ('anon'),('authenticated'),('service_role')) as role(r)
      cross join (values
        ('syntrake_vault_private.confidential_fingerprints_v1'),
        ('syntrake_vault_private.sealed_ciphertexts_v1'),
        ('syntrake_vault_private.reveal_burns_v1')
      ) as tab(t)`);
    expect(r.rows).toHaveLength(9);
    // Authenticated has minimal SELECT of RLS-scoped nonsecret JOIN keys,
    // but no INSERT rights. No ordinary role can write burns or fingerprints.
    expect(r.rows.every(x=>!x.can_insert)).toBe(true);
    expect(r.rows.filter(x=>x.role!=="authenticated").every(x=>!x.can_select)).toBe(true);
    expect(r.rows.filter(x=>x.table.includes("fingerprints")).every(x=>!x.can_select)).toBe(true);
    const grants=await pool.query<{has_insert:boolean;has_delete:boolean;has_update:boolean}>(`
      select has_table_privilege('syntrake_vault_writer',
        'syntrake_vault_private.reveal_burns_v1','INSERT') as has_insert,
      has_table_privilege('syntrake_vault_writer',
        'syntrake_vault_private.reveal_burns_v1','DELETE') as has_delete,
      has_table_privilege('syntrake_vault_writer',
        'syntrake_vault_private.reveal_burns_v1','UPDATE') as has_update`);
    expect(grants.rows[0]).toEqual({has_insert:true,has_delete:false,has_update:false});
  });

  it("one fingerprint across tenants is rejected by unique HMAC; never persists plaintext",async()=>{
    const fp=Buffer.alloc(32,0x21);
    const first=await asVaultWriter(
      "insert into syntrake_vault_private.confidential_fingerprints_v1(fingerprint_hmac,hmac_key_version) values($1,'VAULT_HMAC_V1') returning fingerprint_id",
      [fp],
    ) as {fingerprint_id:string}[];
    expect(first).toHaveLength(1);
    await expect(asVaultWriter(
      "insert into syntrake_vault_private.confidential_fingerprints_v1(fingerprint_hmac,hmac_key_version) values($1,'VAULT_HMAC_V1')",[fp],
    )).rejects.toThrow();
    const row=await pool.query<{fingerprint_hmac:Buffer}>(
      "select fingerprint_hmac from syntrake_vault_private.confidential_fingerprints_v1 where fingerprint_id=$1",
      [first[0]!.fingerprint_id]);
    expect(row.rows[0]!.fingerprint_hmac.equals(fp)).toBe(true);
    expect(row.rows[0]!.fingerprint_hmac.toString('utf8')).not.toContain("PLAINTEXT");
  });

  it("derives stable private-key HMAC from exact canonical plaintext; PG17 rejects duplicate reseal",async()=>{
    const dir=mkdtempSync(path.join(homedir(),".rl9c-vault-private-hmac-"));
    chmodSync(dir,0o700);
    const keyFile=path.join(dir,"pepper.key");
    writeFileSync(keyFile,Buffer.alloc(32,0x7a),{mode:0o600});
    try{
      const generator=createConfidentialAntiReuseFingerprintV1({
        environment:{
          SYNTRAKE_VAULT_WORKER_MODE:"ISOLATED_SECRET_VAULT_V1",
          SYNTRAKE_VAULT_HMAC_MODE:"VAULT_HMAC_V1",
        },
        secretHmacKeyFilePath:keyFile,
        hmacKeyVersion:"VAULT_HMAC_V1",
      });
      const clear=Buffer.from("SYNTHETIC_HOLDOUT_EXACT_CANONICAL_BYTES_V1","utf8");
      const repeated=Buffer.from(clear),changed=Buffer.from(clear.toString("utf8")+"X");
      const fingerprint=generator.fingerprintExactCanonicalPlaintextV1(clear);
      expect(fingerprint.byteLength).toBe(32);
      expect(generator.fingerprintExactCanonicalPlaintextV1(repeated).equals(fingerprint)).toBe(true);
      expect(generator.fingerprintExactCanonicalPlaintextV1(changed).equals(fingerprint)).toBe(false);
      expect(fingerprint.equals(createHash("sha256").update(clear).digest())).toBe(false);
      const write=async(data:Buffer)=>asVaultWriter(
        "insert into syntrake_vault_private.confidential_fingerprints_v1(fingerprint_hmac,hmac_key_version) values($1,'VAULT_HMAC_V1') returning fingerprint_id",
        [data],
      );
      const first=await write(fingerprint);
      expect(first).toHaveLength(1);
      await expect(write(generator.fingerprintExactCanonicalPlaintextV1(repeated))).rejects.toThrow();
      expect(await write(generator.fingerprintExactCanonicalPlaintextV1(changed))).toHaveLength(1);
      chmodSync(keyFile,0o644);
      expect(()=>generator.fingerprintExactCanonicalPlaintextV1(clear)).toThrow("VAULT_UNAVAILABLE");
      chmodSync(keyFile,0o600);
      const symlink=path.join(dir,"symlink");
      symlinkSync(keyFile,symlink);
      const bad=createConfidentialAntiReuseFingerprintV1({
        environment:{SYNTRAKE_VAULT_WORKER_MODE:"ISOLATED_SECRET_VAULT_V1",SYNTRAKE_VAULT_HMAC_MODE:"VAULT_HMAC_V1"},
        secretHmacKeyFilePath:symlink,
        hmacKeyVersion:"VAULT_HMAC_V1",
      });
      expect(()=>bad.fingerprintExactCanonicalPlaintextV1(clear)).toThrow("VAULT_UNAVAILABLE");
      const hardlink=path.join(dir,"hardlink");
      linkSync(keyFile,hardlink);
      expect(()=>generator.fingerprintExactCanonicalPlaintextV1(clear)).toThrow("VAULT_UNAVAILABLE");
      unlinkSync(hardlink);
      clear.fill(0);repeated.fill(0);changed.fill(0);
    }finally{rmSync(dir,{recursive:true,force:true});}
  });

  it("one sealed locator may be burned only once even with a different evaluation identity",async()=>{
    const fingerprint=await asVaultWriter(
      "insert into syntrake_vault_private.confidential_fingerprints_v1(fingerprint_hmac,hmac_key_version) values($1,'VAULT_HMAC_V1') returning fingerprint_id",
      [Buffer.alloc(32,0x35)],
    ) as {fingerprint_id:string}[];
    const sealed=await asVaultWriter(`
      insert into syntrake_vault_private.sealed_ciphertexts_v1
      (fingerprint_id,tenant_id,registration_hash_hex,sealed_locator_hex,ciphertext_sha256_hex)
      values($1,$2,$3,$4,$5) returning sealed_id`,
      [fingerprint[0]!.fingerprint_id,workerId,"D".repeat(64),"E".repeat(64),"F".repeat(64)],
    ) as {sealed_id:string}[];
    const insertBurn=`
      insert into syntrake_vault_private.reveal_burns_v1
      (sealed_id,tenant_id,evaluation_hash_hex,reveal_started_hash_hex,reader_auth_user_id,access_expires_at)
      values($1,$2,$3,$4,$5,transaction_timestamp()+interval '30 seconds')`;
    await asVaultWriter(insertBurn,[sealed[0]!.sealed_id,workerId,"5".repeat(64),"6".repeat(64),workerId]);
    await expect(asVaultWriter(insertBurn,
      [sealed[0]!.sealed_id,workerId,"7".repeat(64),"8".repeat(64),workerId]))
      .rejects.toThrow();
    const count=await pool.query<{n:number}>(
      "select count(*)::int as n from syntrake_vault_private.reveal_burns_v1 where sealed_id=$1",
      [sealed[0]!.sealed_id]);
    expect(count.rows[0]!.n).toBe(1);
  });
});
