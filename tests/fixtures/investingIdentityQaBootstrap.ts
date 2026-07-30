type QaDatabase = Readonly<{
  query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}>;

type InvestingQaAccount = Readonly<{
  accountId: string;
  ownerId: string;
  portfolioId: string;
}>;

export async function ensureInvestingQaAccount(
  database: QaDatabase,
  account: InvestingQaAccount,
): Promise<void> {
  const identitySchema = await database.query(
    `select exists(
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'investing_accounts'
         and column_name = 'tenant_id'
     ) identity_schema`,
  );
  if (!identitySchema.rows[0]?.identity_schema) {
    await database.query(
      `insert into public.investing_accounts(
         id,user_id,portfolio_id,base_currency,environment,status
       ) values($1,$2,$3,'EUR','paper','active')
       on conflict(id) do nothing`,
      [account.accountId, account.ownerId, account.portfolioId],
    );
    return;
  }

  const tenant = await database.query(
    `insert into public.investing_tenants(owner_user_id)
     values($1)
     on conflict(owner_user_id) do update
       set owner_user_id = excluded.owner_user_id
     returning id`,
    [account.ownerId],
  );
  const tenantId = tenant.rows[0]?.id;
  await database.query(
    `insert into public.investing_tenant_memberships(
       tenant_id,user_id,permissions
     ) values($1,$2,$3)
     on conflict(tenant_id,user_id) do nothing`,
    [
      tenantId,
      account.ownerId,
      [
        "investing:read",
        "investing:create",
        "investing:verify",
        "investing:replay",
      ],
    ],
  );
  await database.query(
    `insert into public.investing_accounts(
       id,user_id,owner_user_id,tenant_id,portfolio_id,
       base_currency,environment,status
     ) values($1,$2,$2,$3,$4,'EUR','paper','active')
     on conflict(id) do nothing`,
    [account.accountId, account.ownerId, tenantId, account.portfolioId],
  );
}
