import type {
  InvestingBrokerAccountSnapshot,
  InvestingBrokerAdapter,
  InvestingFill,
  InvestingOrderRequest,
  InvestingOrderSubmission,
} from "@/lib/investing/broker/types";
import { InvestingLiveExecutionBlockedError } from "@/lib/investing/broker/types";

export class DisabledInvestingLiveBrokerAdapter implements InvestingBrokerAdapter {
  readonly environment = "live" as const;

  async submitOrder(request: InvestingOrderRequest): Promise<InvestingOrderSubmission> {
    void request;
    throw new InvestingLiveExecutionBlockedError();
  }

  async getOrder(brokerOrderId: string): Promise<InvestingOrderSubmission | null> {
    void brokerOrderId;
    throw new InvestingLiveExecutionBlockedError("Live investing order reads are disabled.");
  }

  async cancelOrder(brokerOrderId: string): Promise<InvestingOrderSubmission> {
    void brokerOrderId;
    throw new InvestingLiveExecutionBlockedError("Live investing cancellation is disabled.");
  }

  async listOpenOrders(): Promise<InvestingOrderSubmission[]> {
    throw new InvestingLiveExecutionBlockedError("Live investing order reads are disabled.");
  }

  async listFills(since?: string): Promise<InvestingFill[]> {
    void since;
    throw new InvestingLiveExecutionBlockedError("Live investing fill reads are disabled.");
  }

  async getAccountSnapshot(): Promise<InvestingBrokerAccountSnapshot> {
    throw new InvestingLiveExecutionBlockedError("Live investing account reads are disabled.");
  }
}
