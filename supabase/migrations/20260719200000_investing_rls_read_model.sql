-- Owner-scoped read model. Financial writes remain service-role RPC only.

drop policy if exists investing_cash_movements_select_own on public.investing_cash_movements;
create policy investing_cash_movements_select_own on public.investing_cash_movements for select to authenticated
using (exists(select 1 from public.investing_accounts a where a.id=account_id and a.user_id=(auth.jwt()->>'sub')));

drop policy if exists investing_fills_select_own on public.investing_fills;
create policy investing_fills_select_own on public.investing_fills for select to authenticated
using (exists(select 1 from public.investing_orders o where o.id=order_id and o.user_id=(auth.jwt()->>'sub')));

drop policy if exists investing_fees_select_own on public.investing_fees;
create policy investing_fees_select_own on public.investing_fees for select to authenticated
using (exists(select 1 from public.investing_orders o where o.id=order_id and o.user_id=(auth.jwt()->>'sub')));

drop policy if exists investing_corporate_actions_select_own on public.investing_corporate_actions;
create policy investing_corporate_actions_select_own on public.investing_corporate_actions for select to authenticated
using (exists(select 1 from public.investing_accounts a where a.id=account_id and a.user_id=(auth.jwt()->>'sub')));

drop policy if exists investing_ledger_transactions_select_own on public.investing_ledger_transactions;
create policy investing_ledger_transactions_select_own on public.investing_ledger_transactions for select to authenticated
using (exists(select 1 from public.investing_accounts a where a.id=account_id and a.user_id=(auth.jwt()->>'sub')));

drop policy if exists investing_ledger_entries_select_own on public.investing_ledger_entries;
create policy investing_ledger_entries_select_own on public.investing_ledger_entries for select to authenticated
using (exists(select 1 from public.investing_accounts a where a.id=account_id and a.user_id=(auth.jwt()->>'sub')));

drop policy if exists investing_reconciliation_items_select_own on public.investing_reconciliation_items;
create policy investing_reconciliation_items_select_own on public.investing_reconciliation_items for select to authenticated
using (exists(
  select 1 from public.investing_reconciliation_runs r
  where r.id=run_id and r.user_id=(auth.jwt()->>'sub')
));

-- No browser role receives INSERT/UPDATE/DELETE policies on operational Investing tables.
revoke insert,update,delete on table
  public.investing_accounts,public.investing_cash_balances,public.investing_cash_movements,
  public.investing_orders,public.investing_fills,public.investing_fees,public.investing_positions,
  public.investing_corporate_actions,public.investing_ledger_transactions,public.investing_ledger_entries,
  public.investing_execution_events,public.investing_control_evaluations,
  public.investing_reconciliation_runs,public.investing_reconciliation_items,
  public.investing_daily_cycles
from anon,authenticated;
