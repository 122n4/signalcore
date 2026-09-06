export const I4C_FROZEN_PLAN_WRITER_SQL_BLOB_SHA = "d30a02d36acbac46446e7a8eb5bc0ab577f6f3ca";
export const I4C_FROZEN_PLAN_WRITER_COMMIT_SHA = "8b0376a3d76eaf16e05a07770749fe562e4880c7";

const pg17HardeningRules = [
  {
    id: "NULL_COLUMN_ACL",
    expectedOccurrences: 6,
    from: "pg_catalog.aclexplode(coalesce(a.attacl, '{}'::aclitem[]))",
    to: "pg_catalog.aclexplode(a.attacl)",
  },
  {
    id: "POLICY_ROLE_OID_ARRAY",
    expectedOccurrences: 2,
    from: "pol.polroles = array['investing_app'::regrole]",
    to: "pol.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'investing_app')]",
  },
] as const;

function occurrenceCount(value: string, needle: string) {
  if (!needle) return 0;
  return value.split(needle).length - 1;
}

export type I4cPg17HardeningResult = Readonly<{
  sql: string;
  replacements: number;
  rules: ReadonlyArray<Readonly<{ id: string; replacements: number }>>;
}>;

export function renderI4cPlanWriterPg17Candidate(sourceSql: string): I4cPg17HardeningResult {
  let sql = sourceSql;
  const applied: Array<Readonly<{ id: string; replacements: number }>> = [];
  let replacements = 0;

  for (const rule of pg17HardeningRules) {
    const observed = occurrenceCount(sql, rule.from);
    if (observed !== rule.expectedOccurrences) {
      throw new Error(
        `I4-C PG17 hardening drift for ${rule.id}: expected ${rule.expectedOccurrences} source occurrences, found ${observed}`,
      );
    }

    sql = sql.split(rule.from).join(rule.to);
    replacements += observed;
    applied.push({ id: rule.id, replacements: observed });
  }

  for (const rule of pg17HardeningRules) {
    if (occurrenceCount(sql, rule.from) !== 0) {
      throw new Error(`I4-C PG17 hardening failed closed for ${rule.id}: legacy source form remains`);
    }
    if (occurrenceCount(sql, rule.to) < rule.expectedOccurrences) {
      throw new Error(`I4-C PG17 hardening failed closed for ${rule.id}: hardened form is incomplete`);
    }
  }

  return { sql, replacements, rules: applied };
}
