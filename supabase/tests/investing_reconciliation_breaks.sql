\set ON_ERROR_STOP on
begin;
set local role service_role;

select public.investing_open_paper_account_v2(
  'reconciliation_validation_user','reconciliation_portfolio','EUR',2000,
  'reconciliation_funding','reconciliation_funding_correlation'
);

do $$
declare
  v_account uuid;
  v_queue uuid;
  v_order uuid;
  v_fill uuid;
  v_tx uuid;
  v_run uuid;
  v_item uuid;
  v_result jsonb;
begin
  select id into v_account from public.investing_accounts
  where user_id='reconciliation_validation_user';

  insert into public.investing_rebalance_ledger(
    user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,status,
    rebalance_actions,governance_policy,portfolio_id,account_id
  ) values (
    'reconciliation_validation_user','investing','2099-04-01','reconciliation-buy',
    'reconciliation-mandate','proposed',
    '[{"symbol":"VWCE","action":"buy","deltaValueEur":100}]',
    '{"approvedSymbols":["VWCE"]}','reconciliation_portfolio',v_account
  );
  insert into public.investing_execution_queue(
    user_id,mode,day_key,decision_fingerprint,mandate_fingerprint,
    execution_decision,approval_status,approval_required,deployable_capital_eur,
    portfolio_id,account_id,operational_state,version
  ) values (
    'reconciliation_validation_user','investing','2099-04-01','reconciliation-buy',
    'reconciliation-mandate','paper_execute','not_required',false,500,
    'reconciliation_portfolio',v_account,'approved',1
  ) returning id into v_queue;

  v_result:=public.investing_submit_paper_order_v2(
    'reconciliation_validation_user',v_queue,1,'VWCE',100,now(),
    'reconciliation-client','reconciliation-idempotency','reconciliation-submit'
  );
  v_order:=(v_result->>'order_id')::uuid;
  perform public.investing_ack_paper_order_v2(
    'reconciliation_validation_user',v_order,'reconciliation-ack'
  );
  perform public.investing_record_paper_fill_v2(
    'reconciliation_validation_user',v_order,'reconciliation-fill',
    'reconciliation-broker-fill',1,100,1,2,now(),'reconciliation-fill-correlation'
  );
  select id into v_fill from public.investing_fills where order_id=v_order;

  -- Every deliberately corrupted scenario is rolled back after its assertions,
  -- so each starts from the same valid persisted order.
  begin
    perform public.investing_start_paper_reconciliation_v2('reconciliation_validation_user',v_order,'rec-start-cash');
    update public.investing_cash_balances set available_amount=available_amount+1 where account_id=v_account;
    v_result:=public.investing_reconcile_paper_order_v2('reconciliation_validation_user',v_order,'rec-break-cash');
    if (v_result->>'ok')::boolean or not exists(
      select 1 from public.investing_reconciliation_items i join public.investing_reconciliation_runs r on r.id=i.run_id
      where r.correlation_id='rec-break-cash' and i.item_type='cash_projection' and i.severity='critical'
    ) then raise exception 'cash_break_not_material'; end if;
    raise exception '__rollback_scenario__';
  exception when others then if sqlerrm<>'__rollback_scenario__' then raise; end if; end;

  begin
    perform public.investing_start_paper_reconciliation_v2('reconciliation_validation_user',v_order,'rec-start-settled');
    update public.investing_cash_balances set settled_amount=settled_amount-1 where account_id=v_account;
    v_result:=public.investing_reconcile_paper_order_v2('reconciliation_validation_user',v_order,'rec-break-settled');
    if (v_result->>'ok')::boolean or not exists(
      select 1 from public.investing_reconciliation_items i join public.investing_reconciliation_runs r on r.id=i.run_id
      where r.correlation_id='rec-break-settled' and i.item_type='cash_projection'
    ) then raise exception 'settled_break_not_detected'; end if;
    raise exception '__rollback_scenario__';
  exception when others then if sqlerrm<>'__rollback_scenario__' then raise; end if; end;

  begin
    perform public.investing_start_paper_reconciliation_v2('reconciliation_validation_user',v_order,'rec-start-reserved');
    update public.investing_cash_balances set reserved_amount=1 where account_id=v_account;
    v_result:=public.investing_reconcile_paper_order_v2('reconciliation_validation_user',v_order,'rec-break-reserved');
    if (v_result->>'ok')::boolean or not exists(
      select 1 from public.investing_reconciliation_items i join public.investing_reconciliation_runs r on r.id=i.run_id
      where r.correlation_id='rec-break-reserved' and i.item_type='cash_reservations' and i.severity='material'
    ) then raise exception 'reserved_cash_break_not_detected'; end if;
    raise exception '__rollback_scenario__';
  exception when others then if sqlerrm<>'__rollback_scenario__' then raise; end if; end;

  begin
    perform public.investing_start_paper_reconciliation_v2('reconciliation_validation_user',v_order,'rec-start-position');
    update public.investing_positions set quantity=quantity+1 where account_id=v_account and symbol='VWCE';
    v_result:=public.investing_reconcile_paper_order_v2('reconciliation_validation_user',v_order,'rec-break-position');
    if (v_result->>'ok')::boolean or not exists(
      select 1 from public.investing_reconciliation_items i join public.investing_reconciliation_runs r on r.id=i.run_id
      where r.correlation_id='rec-break-position' and i.item_type='position_and_corporate_actions' and i.severity='critical'
    ) then raise exception 'position_or_missing_action_break_not_detected'; end if;
    raise exception '__rollback_scenario__';
  exception when others then if sqlerrm<>'__rollback_scenario__' then raise; end if; end;

  begin
    perform public.investing_start_paper_reconciliation_v2('reconciliation_validation_user',v_order,'rec-start-fees');
    insert into public.investing_fees(fill_id,order_id,fee_type,amount,currency)
    values(v_fill,v_order,'regulatory',1,'EUR');
    v_result:=public.investing_reconcile_paper_order_v2('reconciliation_validation_user',v_order,'rec-break-fees');
    if (v_result->>'ok')::boolean or not exists(
      select 1 from public.investing_reconciliation_items i join public.investing_reconciliation_runs r on r.id=i.run_id
      where r.correlation_id='rec-break-fees' and i.item_type='fees_and_taxes' and i.severity='material'
    ) then raise exception 'fee_break_not_detected'; end if;
    raise exception '__rollback_scenario__';
  exception when others then if sqlerrm<>'__rollback_scenario__' then raise; end if; end;

  begin
    perform public.investing_start_paper_reconciliation_v2('reconciliation_validation_user',v_order,'rec-start-taxes');
    insert into public.investing_fills(
      fill_id,order_id,broker_fill_id,quantity,price,gross_amount,fee_amount,tax_amount,currency,executed_at,payload_hash
    ) values('reconciliation-tax-mismatch-fill',v_order,'reconciliation-tax-mismatch-broker',0.1,100,10,0,1,'EUR',now(),'fixture-corruption');
    v_result:=public.investing_reconcile_paper_order_v2('reconciliation_validation_user',v_order,'rec-break-taxes');
    if (v_result->>'ok')::boolean or not exists(
      select 1 from public.investing_reconciliation_items i join public.investing_reconciliation_runs r on r.id=i.run_id
      where r.correlation_id='rec-break-taxes' and i.item_type='fees_and_taxes' and i.severity='material'
    ) then raise exception 'tax_break_not_detected'; end if;
    raise exception '__rollback_scenario__';
  exception when others then if sqlerrm<>'__rollback_scenario__' then raise; end if; end;

  begin
    perform public.investing_start_paper_reconciliation_v2('reconciliation_validation_user',v_order,'rec-start-missing-ledger');
    insert into public.investing_fills(
      fill_id,order_id,broker_fill_id,quantity,price,gross_amount,fee_amount,tax_amount,currency,executed_at,payload_hash
    ) values('reconciliation-uncovered-fill',v_order,'reconciliation-uncovered-broker',0.1,100,10,0,0,'EUR',now(),'fixture-corruption');
    v_result:=public.investing_reconcile_paper_order_v2('reconciliation_validation_user',v_order,'rec-break-missing-ledger');
    if (v_result->>'ok')::boolean or not exists(
      select 1 from public.investing_reconciliation_items i join public.investing_reconciliation_runs r on r.id=i.run_id
      where r.correlation_id='rec-break-missing-ledger' and i.item_type='fill_ledger_coverage' and i.severity='critical'
    ) then raise exception 'missing_fill_ledger_not_detected'; end if;
    raise exception '__rollback_scenario__';
  exception when others then if sqlerrm<>'__rollback_scenario__' then raise; end if; end;

  begin
    perform public.investing_start_paper_reconciliation_v2('reconciliation_validation_user',v_order,'rec-start-ledger');
    insert into public.investing_ledger_transactions(
      account_id,correlation_id,source_type,source_id,currency,payload_hash,actor
    ) values(v_account,'rec-unbalanced-tx','fill','reconciliation-fill','EUR','fixture-corruption','validation')
    returning id into v_tx;
    insert into public.investing_ledger_entries(transaction_id,account_id,account_code,side,amount,currency)
    values(v_tx,v_account,'test_asset','debit',1,'EUR');
    v_result:=public.investing_reconcile_paper_order_v2('reconciliation_validation_user',v_order,'rec-break-ledger');
    if (v_result->>'ok')::boolean or not exists(
      select 1 from public.investing_reconciliation_items i join public.investing_reconciliation_runs r on r.id=i.run_id
      where r.correlation_id='rec-break-ledger' and i.item_type='ledger_balance' and i.severity='critical'
    ) then raise exception 'unbalanced_ledger_not_detected'; end if;
    raise exception '__rollback_scenario__';
  exception when others then if sqlerrm<>'__rollback_scenario__' then raise; end if; end;

  begin
    perform public.investing_start_paper_reconciliation_v2('reconciliation_validation_user',v_order,'rec-start-queue');
    update public.investing_execution_queue set operational_state='submitted' where id=v_queue;
    v_result:=public.investing_reconcile_paper_order_v2('reconciliation_validation_user',v_order,'rec-break-queue');
    if (v_result->>'ok')::boolean or not exists(
      select 1 from public.investing_reconciliation_items i join public.investing_reconciliation_runs r on r.id=i.run_id
      where r.correlation_id='rec-break-queue' and i.item_type='queue_order_state' and i.severity='material'
    ) then raise exception 'queue_break_not_detected'; end if;
    raise exception '__rollback_scenario__';
  exception when others then if sqlerrm<>'__rollback_scenario__' then raise; end if; end;

  begin
    perform public.investing_start_paper_reconciliation_v2('reconciliation_validation_user',v_order,'rec-start-order');
    update public.investing_orders set cumulative_filled_quantity=0.9 where id=v_order;
    v_result:=public.investing_reconcile_paper_order_v2('reconciliation_validation_user',v_order,'rec-break-order');
    if (v_result->>'ok')::boolean or not exists(
      select 1 from public.investing_reconciliation_items i join public.investing_reconciliation_runs r on r.id=i.run_id
      where r.correlation_id='rec-break-order' and i.item_type in ('cumulative_fill_quantity','order_fill_completion') and i.severity='material'
    ) then raise exception 'order_fill_break_not_detected'; end if;
    raise exception '__rollback_scenario__';
  exception when others then if sqlerrm<>'__rollback_scenario__' then raise; end if; end;

  -- Duplicate and orphan persistence are rejected by real unique/FK constraints.
  begin
    insert into public.investing_fills(fill_id,order_id,broker_fill_id,quantity,price,gross_amount,currency,executed_at)
    values('reconciliation-fill',v_order,'other-broker',1,100,100,'EUR',now());
    raise exception 'duplicate_fill_constraint_missing';
  exception when unique_violation then null; end;
  begin
    insert into public.investing_fills(fill_id,order_id,quantity,price,gross_amount,currency,executed_at)
    values('orphan-fill','11111111-1111-4111-8111-111111111111',1,100,100,'EUR',now());
    raise exception 'orphan_fill_constraint_missing';
  exception when foreign_key_violation then null; end;
  begin
    delete from public.investing_orders where id=v_order;
    raise exception 'order_with_children_deleted';
  exception when others then
    if sqlerrm not like '%investing_append_only_violation%' and sqlstate<>'23503' then raise; end if;
  end;

  -- A correctly persisted split changes the expected quantity and remains clean.
  perform public.investing_apply_split_v2(
    'reconciliation_validation_user',v_account,'VWCE',2,'split',
    'reconciliation-real-split','reconciliation-real-split-correlation',now()
  );
  perform public.investing_start_paper_reconciliation_v2(
    'reconciliation_validation_user',v_order,'rec-start-clean-after-split'
  );
  v_result:=public.investing_reconcile_paper_order_v2(
    'reconciliation_validation_user',v_order,'rec-clean-after-split'
  );
  if not (v_result->>'ok')::boolean or v_result->>'status'<>'reconciled' then
    raise exception 'clean_split_reconciliation_failed:%',v_result;
  end if;
  if (select quantity from public.investing_positions where account_id=v_account and symbol='VWCE')<>2 then
    raise exception 'split_projection_not_persisted';
  end if;

  -- Informational findings may remain on a passed run, while their acceptance
  -- and material corrections are recorded as new facts/events.
  insert into public.investing_reconciliation_runs(
    user_id,portfolio_id,account_id,status,score,correlation_id,environment,completed_at
  ) values(
    'reconciliation_validation_user','reconciliation_portfolio',v_account,'passed',100,
    'rec-informational-run','paper',now()
  ) returning id into v_run;
  insert into public.investing_reconciliation_items(
    run_id,item_type,severity,expected,observed,difference
  ) values(v_run,'decimal_representation','informational','{"quantity":1}','{"quantity":1.0}',null)
  returning id into v_item;
  v_result:=public.investing_resolve_reconciliation_item_v2(
    'reconciliation_validation_user',v_item,'accepted_informational','Numerically equivalent values',
    'rec-info-resolution'
  );
  if not (v_result->>'ok')::boolean
     or (select status from public.investing_reconciliation_runs where id=v_run)<>'passed'
     or not exists(select 1 from public.investing_execution_events where correlation_id='rec-info-resolution') then
    raise exception 'informational_resolution_policy_failed';
  end if;

  insert into public.investing_reconciliation_runs(
    user_id,portfolio_id,account_id,status,score,correlation_id,environment,completed_at
  ) values(
    'reconciliation_validation_user','reconciliation_portfolio',v_account,'failed',0,
    'rec-material-history-run','paper',now()
  ) returning id into v_run;
  insert into public.investing_reconciliation_items(
    run_id,item_type,severity,expected,observed,difference
  ) values(v_run,'historical_material_break','material','{"value":1}','{"value":2}','{"delta":1}')
  returning id into v_item;
  v_result:=public.investing_resolve_reconciliation_item_v2(
    'reconciliation_validation_user',v_item,'corrected','Correction persisted separately',
    'rec-material-resolution'
  );
  if not (v_result->>'ok')::boolean
     or (select status from public.investing_reconciliation_runs where id=v_run)<>'failed'
     or (select resolution_status from public.investing_reconciliation_items where id=v_item)<>'open'
     or not exists(select 1 from public.investing_reconciliation_resolutions where item_id=v_item)
     or not exists(select 1 from public.investing_execution_events where correlation_id='rec-material-resolution') then
    raise exception 'append_only_material_resolution_failed';
  end if;
end;
$$;

rollback;
\echo 'Investing material reconciliation-break assertions passed'
