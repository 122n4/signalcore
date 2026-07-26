import "server-only";

import { InvestingIdentityScopeResolverV1 } from "@/lib/investing/identity/resolver.server";
import {
  ClerkInvestingAuthenticatedSessionAdapterV1,
  type InvestingRequestUserReaderV1,
} from "@/lib/investing/identity/infrastructure/clerkSession.server";
import {
  createInvestingIdentityDirectoryPoolV1,
  PostgresInvestingScopeDirectoryAdapterV1,
} from "@/lib/investing/identity/infrastructure/postgresDirectory.server";

export type ProductionInvestingIdentityResolverOptionsV1 = Readonly<{
  connectionString?: string;
  readUser?: InvestingRequestUserReaderV1;
}>;

export function createProductionInvestingIdentityScopeResolverV1(
  options: ProductionInvestingIdentityResolverOptionsV1 = {},
) {
  const connectionString =
    options.connectionString ?? process.env.SUPABASE_DB_URL ?? "";
  const pool = createInvestingIdentityDirectoryPoolV1(connectionString);
  return new InvestingIdentityScopeResolverV1(
    new ClerkInvestingAuthenticatedSessionAdapterV1(options.readUser),
    new PostgresInvestingScopeDirectoryAdapterV1(pool),
  );
}
