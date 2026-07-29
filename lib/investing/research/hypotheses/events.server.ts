import "server-only";

export interface HypothesisEventSink {
  emit(event: Readonly<Record<string, unknown>>): Promise<void>;
}
