export type InvestingHistoricalMarketDataReader = {
  readHistoricalRaw(args: {
    symbol: string;
    startDate: string;
    endDate: string;
  }): Promise<ReadonlyArray<Record<string, unknown>>>;
};

export class DisabledInvestingHistoricalMarketDataWriter {
  async writeHistoricalRaw(): Promise<never> {
    throw new Error("investing_historical_raw_is_read_only");
  }
}
