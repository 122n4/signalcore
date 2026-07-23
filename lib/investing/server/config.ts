export type InvestingPaperConfig = {
  environment: "paper";
  feeRateBps: number;
  taxRateBps: number;
  fillFraction: number;
  workerSecret: string;
};

function finiteRate(value: string | undefined, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1_000 ? number : fallback;
}

export function readInvestingPaperConfig(env: NodeJS.ProcessEnv = process.env): InvestingPaperConfig {
  const environment = String(env.INVESTING_EXECUTION_ENVIRONMENT || "paper").trim().toLowerCase();
  if (environment !== "paper") {
    throw new Error(environment === "live" ? "investing_live_execution_blocked" : "investing_execution_environment_invalid");
  }
  return {
    environment: "paper",
    feeRateBps: finiteRate(env.INVESTING_PAPER_FEE_RATE_BPS, 5),
    taxRateBps: finiteRate(env.INVESTING_PAPER_TAX_RATE_BPS, 0),
    fillFraction: Math.max(0.01, Math.min(1, Number(env.INVESTING_PAPER_FILL_FRACTION || 1) || 1)),
    workerSecret: String(env.INVESTING_PAPER_WORKER_SECRET || "").trim(),
  };
}
