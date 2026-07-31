import "server-only";import type {ScopedSqlPool} from "@/lib/investing/research/dataset-catalog/postgresRepository.server";
import {SHADOW_PARITY_SNAPSHOT_VERSION,type ShadowParityScope,type ShadowParitySnapshot} from "./types";
const n=(v:unknown)=>{const x=Number(v);return Number.isFinite(x)&&x>=0?x:null};
export class PostgresShadowParitySource{constructor(private readonly pool:ScopedSqlPool){}async load(scope:ShadowParityScope,observedAt:string){
 const client=await this.pool.connect();try{await client.query("begin read only");const account=await client.query(`select id::text,user_id,portfolio_id,base_currency,environment,status
  from public.investing_accounts where id=$1::uuid and tenant_id=$2::uuid and owner_user_id=$3 and portfolio_id=$4 and status='active'`,[scope.accountId,scope.tenantId,scope.ownerId,scope.portfolioId]);
 if(account.rows.length!==1)throw new Error("shadow_parity_account_not_found");const [legacyItems,legacyCash,canonicalCash,canonicalPositions,canonicalOrders]=await Promise.all([
  client.query(`select upper(symbol) symbol,qty,value_eur from public.portfolio_items where user_id=$1 and mode='investing' order by upper(symbol)`,[scope.ownerId]),
  client.query(`select coalesce((select cash_eur from public.portfolio_meta where user_id=$1 and mode='investing'),
   (select cash_eur from public.portfolios where user_id=$1 and mode='investing' order by updated_at desc limit 1)) cash_eur`,[scope.ownerId]),
  client.query(`select available_amount from public.investing_cash_balances where account_id=$1::uuid and currency='EUR'`,[scope.accountId]),
  client.query(`select upper(symbol) symbol,quantity,cost_basis from public.investing_positions where account_id=$1::uuid and quantity>0 order by upper(symbol)`,[scope.accountId]),
  client.query(`select upper(symbol) symbol,side,sum(greatest(coalesce(quantity,0)-coalesce(cumulative_filled_quantity,0),0)) quantity
   from public.investing_orders where account_id=$1::uuid and status in('proposed','awaiting_approval','approved','submitting','submitted','partially_filled','reconciling')
   group by upper(symbol),side order by upper(symbol),side`,[scope.accountId])]);
 const legacyPositions=legacyItems.rows.map(r=>({symbol:String(r.symbol),quantity:n(r.qty)??0,valueEur:n(r.value_eur)}));
 const canonicalPositionValues=canonicalPositions.rows.map(r=>({symbol:String(r.symbol),quantity:n(r.quantity)??0,valueEur:n(r.cost_basis)}));
 const legacyCashEur=n(legacyCash.rows[0]?.cash_eur),canonicalCashEur=canonicalCash.rows.length===1?n(canonicalCash.rows[0]?.available_amount):null;
 const legacyValuation=legacyCashEur!==null&&legacyPositions.every(x=>x.valueEur!==null)?legacyCashEur+legacyPositions.reduce((s,x)=>s+(x.valueEur??0),0):null;
 const canonicalValuation=canonicalCashEur!==null&&canonicalPositionValues.every(x=>x.valueEur!==null)?canonicalCashEur+canonicalPositionValues.reduce((s,x)=>s+(x.valueEur??0),0):null;
 const base={contractVersion:SHADOW_PARITY_SNAPSHOT_VERSION,scope:structuredClone(scope),observedAt} as const;
 const legacy:ShadowParitySnapshot={...base,source:"legacy",sourceVersion:"portfolio-items/v1",cashEur:legacyCashEur,positions:legacyPositions,pending:[],valuationEur:legacyValuation};
 const canonical:ShadowParitySnapshot={...base,source:"canonical",sourceVersion:"investing-ledger-projections/v1",cashEur:canonicalCashEur,
  positions:canonicalPositionValues,pending:canonicalOrders.rows.map(r=>({symbol:String(r.symbol),side:r.side as "buy"|"sell",quantity:n(r.quantity)??0})),valuationEur:canonicalValuation};
 await client.query("commit");return {legacy,canonical}
 }catch(error){try{await client.query("rollback")}catch{}throw error}finally{client.release?.()}}}
