// lib/execution/types.ts
import type { ExecutionAction } from "@/lib/signalcore/types";

export type ExecutionQueueItem = {
  id: string;
  user_id?: string;
  created_at?: string;

  status: "queued" | "done" | "dismissed";
  source: "opportunities" | "daily" | "advisor";

  action: ExecutionAction;

  // extra proof + UX
  notes?: string;
  copied?: boolean;
  done_at?: string | null;
};