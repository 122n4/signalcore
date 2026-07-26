import "server-only";

import { Pool, type PoolClient } from "pg";

import type {
  InvestingAuthorizedPortfolioV1,
  InvestingScopeDirectoryPortV1,
  InvestingTenantMembershipV1,
} from "@/lib/investing/identity/ports";

type QueryablePool = Pick<Pool, "connect">;
type OptionalOperationBudget = Readonly<{ remainingMs(): number }>;

async function authenticatedRead<T>(
  pool: QueryablePool,
  authenticatedUserId: string,
  budget: OptionalOperationBudget | undefined,
  read: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin read only");
    const remainingMs = budget?.remainingMs();
    if (remainingMs !== undefined && remainingMs <= 0) {
      throw new Error("investing_ops_budget_expired");
    }
    await client.query("set local role authenticated");
    await client.query(
      "select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: authenticatedUserId })],
    );
    if (remainingMs !== undefined) {
      await client.query(
        "select set_config('statement_timeout', $1, true)",
        [`${remainingMs}ms`],
      );
    }
    const result = await read(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export class PostgresInvestingScopeDirectoryAdapterV1
implements InvestingScopeDirectoryPortV1 {
  constructor(
    private readonly pool: QueryablePool,
    private readonly budget?: OptionalOperationBudget,
  ) {}

  async findMemberships(
    authenticatedUserId: string,
  ): Promise<readonly InvestingTenantMembershipV1[]> {
    return authenticatedRead(this.pool, authenticatedUserId, this.budget, async (client) => {
      const result = await client.query<{
        membership_id: string;
        user_id: string;
        owner_user_id: string;
        tenant_id: string;
        role: string;
        permissions: InvestingTenantMembershipV1["permissions"];
        status: InvestingTenantMembershipV1["status"];
      }>(
        `select m.id::text membership_id, m.user_id, t.owner_user_id,
                m.tenant_id::text, m.role, m.permissions, m.status
           from public.investing_tenant_memberships m
           join public.investing_tenants t on t.id = m.tenant_id
          where m.user_id = $1
          order by m.id`,
        [authenticatedUserId],
      );
      return result.rows.map((row) => ({
        membershipId: row.membership_id,
        authenticatedUserId: row.user_id,
        ownerId: row.owner_user_id,
        tenantId: row.tenant_id,
        role: row.role,
        permissions: row.permissions,
        status: row.status,
      }));
    });
  }

  async findPortfolios(args: Readonly<{
    authenticatedUserId: string;
    ownerId: string;
    tenantId: string;
  }>): Promise<readonly InvestingAuthorizedPortfolioV1[]> {
    return authenticatedRead(
      this.pool,
      args.authenticatedUserId,
      this.budget,
      async (client) => {
        const result = await client.query<{
          portfolio_id: string;
          account_id: string;
          owner_user_id: string;
          tenant_id: string;
          status: "active" | "inactive" | "closed";
        }>(
          `select a.portfolio_id, a.id::text account_id, a.owner_user_id,
                  a.tenant_id::text,
                  case when a.status = 'active' then 'active'
                       when a.status = 'closed' then 'closed'
                       else 'inactive' end status
             from public.investing_accounts a
            where a.owner_user_id = $1 and a.tenant_id = $2::uuid
              and a.environment = 'paper'
            order by a.id`,
          [args.ownerId, args.tenantId],
        );
        return result.rows.map((row) => ({
          portfolioId: row.portfolio_id,
          accountId: row.account_id,
          ownerId: row.owner_user_id,
          tenantId: row.tenant_id,
          status: row.status,
          investingEnabled: row.status === "active",
        }));
      },
    );
  }
}

export function createInvestingIdentityDirectoryPoolV1(
  connectionString: string,
): Pool {
  if (!connectionString) {
    throw new Error("investing_identity_database_configuration_required");
  }
  return new Pool({ connectionString, max: 4 });
}
