export type InvestingDestructiveQaTarget = Readonly<{
  host: string;
  port: number;
  database: string;
}>;

export type InvestingDestructiveQaEffectiveTarget = Readonly<{
  host: string;
  port: number;
  database: string;
}>;

const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const DATABASE_TOKEN_BOUNDARY = "(?:^|[_.-])";
const DATABASE_TOKEN_END = "(?:$|[_.-])";
const DISPOSABLE_DATABASE_NAME = new RegExp(
  `${DATABASE_TOKEN_BOUNDARY}(?:qa|test|audit|discardable|temporary|temp)${DATABASE_TOKEN_END}`,
  "iu",
);
const DANGEROUS_DATABASE_NAME = new RegExp(
  `${DATABASE_TOKEN_BOUNDARY}(?:production|prod|staging|stage|live|main|primary)${DATABASE_TOKEN_END}`,
  "iu",
);
const POSTGRES_DESTINATION_ENVIRONMENT_KEYS = [
  "PGHOST",
  "PGHOSTADDR",
  "PGPORT",
  "PGDATABASE",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGTARGETSESSIONATTRS",
  "PGLOADBALANCEHOSTS",
] as const;

function assertPostgresDestinationEnvironmentSafe(
  environment: Readonly<Record<string, string | undefined>>,
): void {
  const conflicting = POSTGRES_DESTINATION_ENVIRONMENT_KEYS.filter(
    (key) => environment[key] !== undefined && environment[key] !== "",
  );
  if (conflicting.length > 0) {
    throw new Error(`investing_destructive_qa_external_database_environment:${conflicting.join(",")}`);
  }
}

export function assertDestructiveInvestingQaDatabase(
  databaseUrl: string,
  destructiveConfirmation: string | undefined,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): InvestingDestructiveQaTarget {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("investing_destructive_qa_invalid_database_url");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw new Error("investing_destructive_qa_invalid_database_protocol");
  }
  if (
    databaseUrl !== databaseUrl.trim()
    || !/^(?:postgres|postgresql):\/\//u.test(databaseUrl)
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.search !== ""
    || parsed.hash !== ""
  ) {
    throw new Error("investing_destructive_qa_ambiguous_database_url");
  }
  const rawAuthority = databaseUrl.slice(databaseUrl.indexOf("//") + 2, databaseUrl.indexOf("/", databaseUrl.indexOf("//") + 2));
  if (!rawAuthority || rawAuthority.includes(",") || rawAuthority.includes("%") || rawAuthority.includes("@")) {
    throw new Error("investing_destructive_qa_ambiguous_database_url");
  }
  if (!LOCAL_DATABASE_HOSTS.has(parsed.hostname)) {
    throw new Error("investing_destructive_qa_requires_local_database");
  }
  if (parsed.port === "") {
    throw new Error("investing_destructive_qa_requires_explicit_port");
  }
  const port = Number(parsed.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("investing_destructive_qa_invalid_database_port");
  }
  let database: string;
  try {
    database = decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
  } catch {
    throw new Error("investing_destructive_qa_ambiguous_database_url");
  }
  if (DANGEROUS_DATABASE_NAME.test(database)) {
    throw new Error("investing_destructive_qa_forbidden_database_name");
  }
  if (
    parsed.pathname !== `/${database}`
    || !/^[A-Za-z0-9_.-]+$/u.test(database)
    || databaseUrl !== `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}/${database}`
  ) {
    throw new Error("investing_destructive_qa_ambiguous_database_url");
  }
  if (!database || !DISPOSABLE_DATABASE_NAME.test(database)) {
    throw new Error("investing_destructive_qa_requires_disposable_database_name");
  }
  if (destructiveConfirmation !== "true") {
    throw new Error("investing_destructive_qa_requires_explicit_confirmation");
  }
  assertPostgresDestinationEnvironmentSafe(environment);
  return { host: parsed.hostname, port, database };
}

export function assertEffectiveDestructiveInvestingQaDatabase(
  validated: InvestingDestructiveQaTarget,
  effective: InvestingDestructiveQaEffectiveTarget,
): void {
  if (
    effective.host !== validated.host
    || effective.port !== validated.port
    || effective.database !== validated.database
  ) {
    throw new Error("investing_destructive_qa_effective_target_mismatch");
  }
}
