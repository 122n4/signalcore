import { Pool, type PoolClient } from "pg";
import type {
  InvestingAuthorityDatabase,
  InvestingAuthorityQueryResult,
  InvestingAuthorityTransactionClient,
} from "./context";

export type InvestingDatabaseConfig =
  | {
      ok: true;
      connectionString: string;
      host: string;
      port: 6543;
      database: "postgres";
      user: string;
      role: "investing_app";
      projectRef: string;
      transport: "SUPABASE_SHARED_POOLER_TRANSACTION_MODE";
      preparedStatements: false;
      tls: {
        rejectUnauthorized: true;
      };
    }
  | {
      ok: false;
      code: "MISSING_INVESTING_DATABASE_URL" | "MALFORMED_INVESTING_DATABASE_URL";
    };

let pool: Pool | null = null;

export function readInvestingDatabaseConfig(
  env: Record<string, string | undefined> = process.env,
): InvestingDatabaseConfig {
  const rawUrl = env.INVESTING_DATABASE_URL;
  if (!rawUrl) return { ok: false, code: "MISSING_INVESTING_DATABASE_URL" };

  try {
    const parsed = new URL(rawUrl);
    const protocolOk = parsed.protocol === "postgres:" || parsed.protocol === "postgresql:";
    const database = parsed.pathname.replace(/^\//, "");
    const port = Number(parsed.port);
    const username = decodeURIComponent(parsed.username);
    const [role, projectRef, ...extra] = username.split(".");
    const host = parsed.hostname.toLowerCase();

    if (
      !protocolOk ||
      database !== "postgres" ||
      port !== 6543 ||
      role !== "investing_app" ||
      !projectRef ||
      extra.length > 0 ||
      parsed.password.length === 0 ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      !host.endsWith(".pooler.supabase.com")
    ) {
      return { ok: false, code: "MALFORMED_INVESTING_DATABASE_URL" };
    }

    return {
      ok: true,
      connectionString: rawUrl,
      host,
      port: 6543,
      database: "postgres",
      user: username,
      role: "investing_app",
      projectRef,
      transport: "SUPABASE_SHARED_POOLER_TRANSACTION_MODE",
      preparedStatements: false,
      tls: {
        rejectUnauthorized: true,
      },
    };
  } catch {
    return { ok: false, code: "MALFORMED_INVESTING_DATABASE_URL" };
  }
}

export function getInvestingAuthorityDatabase(): InvestingAuthorityDatabase {
  const config = readInvestingDatabaseConfig();
  if (config.ok === false) {
    throw new Error(config.code);
  }

  if (!pool) {
    pool = new Pool({
      connectionString: config.connectionString,
      ssl: config.tls,
    });
  }

  return {
    connect: async () => new PgAuthorityClient(await pool!.connect()),
  };
}

class PgAuthorityClient implements InvestingAuthorityTransactionClient {
  constructor(private readonly client: PoolClient) {}

  async query<Row = Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<InvestingAuthorityQueryResult<Row>> {
    const result = await this.client.query<Row>(text, [...values]);
    return { rows: result.rows };
  }

  release(destroy = false) {
    this.client.release(destroy);
  }
}
