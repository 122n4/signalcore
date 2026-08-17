import { describe, expect, it } from "vitest";

import {
  assertDestructiveInvestingQaDatabase,
  assertEffectiveDestructiveInvestingQaDatabase,
  assertLocalSupabaseDestructiveInvestingQaTarget,
} from "@/scripts/qa/investingDestructiveQaGuard";

const NO_DATABASE_ENVIRONMENT = {};

describe("Investing destructive PostgreSQL QA guard", () => {
  it("accepts only an explicitly confirmed local disposable database", () => {
    expect(assertDestructiveInvestingQaDatabase(
      "postgresql://127.0.0.1:55432/signalcore_4b_qa",
      "true",
      NO_DATABASE_ENVIRONMENT,
    )).toEqual({ host: "127.0.0.1", port: 55432, database: "signalcore_4b_qa" });
    for (const url of [
      "postgresql://localhost:55432/investing_test",
      "postgresql://127.0.0.1:55432/investing-audit-temp",
      "postgresql://[::1]:55432/investing.discardable",
    ]) expect(() => assertDestructiveInvestingQaDatabase(url, "true", NO_DATABASE_ENVIRONMENT), url).not.toThrow();
  });

  it.each([
    "production_qa", "staging_test", "PRODUCTION_QA", "prod_test",
    "stage-qa", "live.test", "main_qa", "primary-test",
    "qa_production", "test.staging", "qa%2Dprod",
  ])("rejects the dangerous hybrid database name %s", (database) => {
    expect(() => assertDestructiveInvestingQaDatabase(
      `postgresql://127.0.0.1:55432/${database}`,
      "true",
      NO_DATABASE_ENVIRONMENT,
    )).toThrow("investing_destructive_qa_forbidden_database_name");
  });

  it.each([
    ["remote", "postgresql://db.example.com/signalcore_4b_qa", "true", "investing_destructive_qa_requires_local_database"],
    ["remote host query override", "postgresql://127.0.0.1/signalcore_4b_qa?host=db.example.com", "true", "investing_destructive_qa_ambiguous_database_url"],
    ["port query override", "postgresql://127.0.0.1/signalcore_4b_qa?port=6543", "true", "investing_destructive_qa_ambiguous_database_url"],
    ["hostaddr query override", "postgresql://127.0.0.1/signalcore_4b_qa?hostaddr=203.0.113.1", "true", "investing_destructive_qa_ambiguous_database_url"],
    ["service file", "postgresql://127.0.0.1/signalcore_4b_qa?service=external", "true", "investing_destructive_qa_ambiguous_database_url"],
    ["socket path", "postgresql://127.0.0.1/signalcore_4b_qa?host=%2Ftmp", "true", "investing_destructive_qa_ambiguous_database_url"],
    ["multiple hosts", "postgresql://localhost,db.example.com/signalcore_4b_qa", "true", "investing_destructive_qa_ambiguous_database_url"],
    ["percent-encoded host", "postgresql://%31%32%37.0.0.1/signalcore_4b_qa", "true", "investing_destructive_qa_ambiguous_database_url"],
    ["userinfo", "postgresql://postgres:postgres@127.0.0.1/signalcore_4b_qa", "true", "investing_destructive_qa_ambiguous_database_url"],
    ["fragment", "postgresql://127.0.0.1/signalcore_4b_qa#host=db.example.com", "true", "investing_destructive_qa_ambiguous_database_url"],
    ["unknown option", "postgresql://127.0.0.1/signalcore_4b_qa?options=-csearch_path%3Dpublic", "true", "investing_destructive_qa_ambiguous_database_url"],
    ["encoded disposable name", "postgresql://127.0.0.1:55432/investing%5Fqa", "true", "investing_destructive_qa_ambiguous_database_url"],
    ["production-like", "postgresql://127.0.0.1:55432/signalcore", "true", "investing_destructive_qa_requires_disposable_database_name"],
    ["default postgres", "postgresql://127.0.0.1:55432/postgres", "true", "investing_destructive_qa_requires_disposable_database_name"],
    ["missing confirmation", "postgresql://127.0.0.1:55432/signalcore_4b_test", undefined, "investing_destructive_qa_requires_explicit_confirmation"],
    ["wrong confirmation", "postgresql://localhost:55432/signalcore_4b_audit", "1", "investing_destructive_qa_requires_explicit_confirmation"],
    ["similar confirmation", "postgresql://localhost:55432/signalcore_4b_audit", "true ", "investing_destructive_qa_requires_explicit_confirmation"],
    ["wrong protocol", "https://localhost/signalcore_4b_qa", "true", "investing_destructive_qa_invalid_database_protocol"],
    ["invalid URL", "not a url", "true", "investing_destructive_qa_invalid_database_url"],
  ])("rejects %s targets", (_name, url, confirmation, code) => {
    expect(() => assertDestructiveInvestingQaDatabase(url, confirmation, NO_DATABASE_ENVIRONMENT)).toThrow(code);
  });

  it.each([
    ["missing port with PGPORT", "postgresql://localhost/investing_test", { PGPORT: "55432" }, "investing_destructive_qa_requires_explicit_port"],
    ["different PGPORT", "postgresql://localhost:55432/investing_test", { PGPORT: "6543" }, "investing_destructive_qa_external_database_environment:PGPORT"],
    ["PGHOST", "postgresql://localhost:55432/investing_test", { PGHOST: "db.example.com" }, "investing_destructive_qa_external_database_environment:PGHOST"],
    ["PGHOSTADDR", "postgresql://localhost:55432/investing_test", { PGHOSTADDR: "203.0.113.1" }, "investing_destructive_qa_external_database_environment:PGHOSTADDR"],
    ["PGSERVICE", "postgresql://localhost:55432/investing_test", { PGSERVICE: "external" }, "investing_destructive_qa_external_database_environment:PGSERVICE"],
    ["PGDATABASE", "postgresql://localhost:55432/investing_test", { PGDATABASE: "other" }, "investing_destructive_qa_external_database_environment:PGDATABASE"],
    ["PGSERVICEFILE", "postgresql://localhost:55432/investing_test", { PGSERVICEFILE: "external.conf" }, "investing_destructive_qa_external_database_environment:PGSERVICEFILE"],
  ])("rejects external PostgreSQL destination environment: %s", (_name, url, environment, code) => {
    expect(() => assertDestructiveInvestingQaDatabase(url, "true", environment)).toThrow(code);
  });

  it.each([
    "postgresql://localhost/investing_test",
    "postgresql://127.0.0.1:0/investing_test",
    "postgresql://127.0.0.1:65536/investing_test",
    "postgresql://127.0.0.1:55432:6543/investing_test",
    "postgresql://127.0.0.1:%35%35%34%33%32/investing_test",
    "postgresql://127.0.0.1:054432/investing_test",
  ])("rejects missing, invalid, multiple, encoded or non-canonical port: %s", (url) => {
    expect(() => assertDestructiveInvestingQaDatabase(url, "true", NO_DATABASE_ENVIRONMENT)).toThrow();
  });

  it("proves the effective host, port and database exactly match the validated target", () => {
    const target = assertDestructiveInvestingQaDatabase(
      "postgresql://127.0.0.1:55432/investing_test",
      "true",
      NO_DATABASE_ENVIRONMENT,
    );
    expect(() => assertEffectiveDestructiveInvestingQaDatabase(target, target)).not.toThrow();
    for (const effective of [
      { ...target, host: "localhost" },
      { ...target, port: 55433 },
      { ...target, database: "other_test" },
    ]) {
      expect(() => assertEffectiveDestructiveInvestingQaDatabase(target, effective))
        .toThrow("investing_destructive_qa_effective_target_mismatch");
    }
  });

  it("aborts before an administrative operation for every ambiguous target", () => {
    let administrativeOperationCalled = false;
    const guardedAdministrativeOperation = (url: string) => {
      assertDestructiveInvestingQaDatabase(url, "true", NO_DATABASE_ENVIRONMENT);
      administrativeOperationCalled = true;
    };
    expect(() => guardedAdministrativeOperation(
      "postgresql://127.0.0.1/signalcore_4b_qa?host=db.example.com",
    )).toThrow("investing_destructive_qa_ambiguous_database_url");
    expect(administrativeOperationCalled).toBe(false);
  });
});

describe("Investing local Supabase destructive QA guard", () => {
  const localDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const localSupabaseUrl = "http://127.0.0.1:54321";

  it("accepts only the explicitly confirmed local Supabase topology used by CI", () => {
    expect(assertLocalSupabaseDestructiveInvestingQaTarget({
      databaseUrl: localDatabaseUrl,
      supabaseUrl: localSupabaseUrl,
      destructiveConfirmation: "true",
      environment: NO_DATABASE_ENVIRONMENT,
    })).toEqual({
      database: { host: "127.0.0.1", port: 54322, database: "postgres" },
      api: { protocol: "http:", host: "127.0.0.1", port: 54321 },
    });
  });

  it.each([
    ["missing confirmation", localDatabaseUrl, localSupabaseUrl, undefined, NO_DATABASE_ENVIRONMENT, "investing_destructive_qa_requires_explicit_confirmation"],
    ["remote DB hostname", "postgresql://postgres:postgres@db.example.com:54322/postgres", localSupabaseUrl, "true", NO_DATABASE_ENVIRONMENT, "investing_destructive_qa_requires_local_database"],
    ["remote Supabase API hostname", localDatabaseUrl, "https://qdnvbamoamtkujzwrxdb.supabase.co", "true", NO_DATABASE_ENVIRONMENT, "investing_destructive_qa_ambiguous_supabase_api_url"],
    ["wrong DB port", "postgresql://postgres:postgres@127.0.0.1:65432/postgres", localSupabaseUrl, "true", NO_DATABASE_ENVIRONMENT, "investing_destructive_qa_unexpected_local_supabase_database_port"],
    ["wrong API port", localDatabaseUrl, "http://127.0.0.1:54323", "true", NO_DATABASE_ENVIRONMENT, "investing_destructive_qa_unexpected_local_supabase_api_port"],
    ["different loopback stack", "postgresql://postgres:postgres@localhost:54322/postgres", localSupabaseUrl, "true", NO_DATABASE_ENVIRONMENT, "investing_destructive_qa_local_supabase_stack_mismatch"],
    ["unexpected database name", "postgresql://postgres:postgres@127.0.0.1:54322/investing_a3e_qa", localSupabaseUrl, "true", NO_DATABASE_ENVIRONMENT, "investing_destructive_qa_unexpected_local_supabase_database_name"],
    ["conflicting PG destination environment", localDatabaseUrl, localSupabaseUrl, "true", { PGHOST: "db.example.com" }, "investing_destructive_qa_external_database_environment:PGHOST"],
  ])("rejects %s before administrative work", (_name, databaseUrl, supabaseUrl, confirmation, environment, code) => {
    let administrativeOperationCalled = false;
    const guardedAdministrativeOperation = () => {
      assertLocalSupabaseDestructiveInvestingQaTarget({
        databaseUrl,
        supabaseUrl,
        destructiveConfirmation: confirmation,
        environment,
      });
      administrativeOperationCalled = true;
    };

    expect(guardedAdministrativeOperation).toThrow(code);
    expect(administrativeOperationCalled).toBe(false);
  });

  it("proves the effective PostgreSQL connection cannot drift from the local Supabase target", () => {
    const target = assertLocalSupabaseDestructiveInvestingQaTarget({
      databaseUrl: localDatabaseUrl,
      supabaseUrl: localSupabaseUrl,
      destructiveConfirmation: "true",
      environment: NO_DATABASE_ENVIRONMENT,
    });

    expect(() => assertEffectiveDestructiveInvestingQaDatabase(target.database, target.database)).not.toThrow();
    expect(() => assertEffectiveDestructiveInvestingQaDatabase(target.database, {
      ...target.database,
      port: 54323,
    })).toThrow("investing_destructive_qa_effective_target_mismatch");
  });
});
