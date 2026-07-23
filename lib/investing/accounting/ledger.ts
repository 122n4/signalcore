import { addMoney, compareMoney, subtractMoney, toMoney } from "@/lib/investing/money/decimal";

export type InvestingLedgerEntrySide = "debit" | "credit";

export type InvestingLedgerEntryDraft = {
  accountCode: string;
  side: InvestingLedgerEntrySide;
  amount: string;
  currency: string;
};

export type InvestingLedgerTransactionDraft = {
  correlationId: string;
  sourceType: string;
  sourceId: string;
  currency: string;
  entries: InvestingLedgerEntryDraft[];
};

export function assertBalancedLedgerTransaction(transaction: InvestingLedgerTransactionDraft) {
  if (!transaction.correlationId || !transaction.sourceType || !transaction.sourceId) {
    throw new Error("ledger_identity_required");
  }
  if (!/^[A-Z]{3}$/.test(transaction.currency)) throw new Error("ledger_currency_invalid");
  if (transaction.entries.length < 2) throw new Error("ledger_entries_insufficient");

  let debit = "0.00";
  let credit = "0.00";
  for (const entry of transaction.entries) {
    if (!entry.accountCode.trim()) throw new Error("ledger_account_required");
    if (entry.currency !== transaction.currency) throw new Error("ledger_currency_mismatch");
    const amount = toMoney(entry.amount, 2);
    if (compareMoney(amount, "0.00", 2) <= 0) throw new Error("ledger_amount_must_be_positive");
    if (entry.side === "debit") debit = addMoney(debit, amount, 2);
    else credit = addMoney(credit, amount, 2);
  }
  if (compareMoney(debit, credit, 2) !== 0) throw new Error("ledger_not_balanced");
}

export function buildTradeSettlementLedger(args: {
  correlationId: string;
  orderId: string;
  side: "buy" | "sell";
  grossAmount: string;
  feeAmount: string;
  taxAmount?: string;
  costBasisAmount?: string;
  currency: string;
}): InvestingLedgerTransactionDraft {
  const currency = args.currency.toUpperCase();
  const gross = toMoney(args.grossAmount, 2);
  const fee = toMoney(args.feeAmount, 2);
  const tax = toMoney(args.taxAmount ?? "0", 2);
  const costBasis = toMoney(args.costBasisAmount ?? gross, 2);
  if (compareMoney(gross, "0", 2) <= 0) throw new Error("ledger_gross_must_be_positive");
  if (compareMoney(fee, "0", 2) < 0 || compareMoney(tax, "0", 2) < 0) {
    throw new Error("ledger_cost_must_be_non_negative");
  }
  if (compareMoney(costBasis, "0", 2) <= 0) throw new Error("ledger_cost_basis_must_be_positive");

  if (args.side === "buy") {
    const cash = addMoney(addMoney(gross, fee, 2), tax, 2);
    const entries: InvestingLedgerEntryDraft[] = [
      { accountCode: "investment_asset", side: "debit", amount: gross, currency },
      ...(compareMoney(fee, "0", 2) > 0 ? [{ accountCode: "fee_expense", side: "debit" as const, amount: fee, currency }] : []),
      ...(compareMoney(tax, "0", 2) > 0 ? [{ accountCode: "tax_expense", side: "debit" as const, amount: tax, currency }] : []),
      { accountCode: "cash", side: "credit", amount: cash, currency },
    ];
    return {
        correlationId: args.correlationId,
        sourceType: "fill",
        sourceId: args.orderId,
        currency,
        entries,
    };
  }

  const netCash = subtractMoney(subtractMoney(gross, fee, 2), tax, 2);
  if (compareMoney(netCash, "0", 2) < 0) throw new Error("ledger_sell_costs_exceed_proceeds");
  const pnl = subtractMoney(gross, costBasis, 2);
  const entries: InvestingLedgerEntryDraft[] = [
    ...(compareMoney(netCash, "0", 2) > 0 ? [{ accountCode: "cash", side: "debit" as const, amount: netCash, currency }] : []),
    ...(compareMoney(fee, "0", 2) > 0 ? [{ accountCode: "fee_expense", side: "debit" as const, amount: fee, currency }] : []),
    ...(compareMoney(tax, "0", 2) > 0 ? [{ accountCode: "tax_expense", side: "debit" as const, amount: tax, currency }] : []),
    ...(compareMoney(pnl, "0", 2) < 0
      ? [{ accountCode: "realized_loss", side: "debit" as const, amount: subtractMoney("0", pnl, 2), currency }]
      : []),
    { accountCode: "investment_asset", side: "credit", amount: costBasis, currency },
    ...(compareMoney(pnl, "0", 2) > 0
      ? [{ accountCode: "realized_gain", side: "credit" as const, amount: pnl, currency }]
      : []),
  ];
  return {
    correlationId: args.correlationId,
    sourceType: "fill",
    sourceId: args.orderId,
    currency,
    entries,
  };
}
