import type { DatasetResult } from "./reasonCodes";
import type { AcquisitionState } from "./types";

const NEXT: Readonly<Record<AcquisitionState, readonly AcquisitionState[]>> = {
  requested: ["acquiring", "cancelled"],
  acquiring: ["acquired_raw", "confirmed_no_data", "provider_unavailable", "acquisition_failed", "cancelled"],
  acquired_raw: ["normalized", "acquisition_failed"],
  normalized: ["awaiting_quality", "acquisition_failed"],
  awaiting_quality: [],
  confirmed_no_data: [],
  provider_unavailable: [],
  acquisition_failed: [],
  cancelled: [],
};

export function transitionAcquisitionState(from: AcquisitionState, to: AcquisitionState): DatasetResult<AcquisitionState> {
  return NEXT[from]?.includes(to)
    ? { ok: true, value: to }
    : { ok: false, issues: [{ path: "acquisition.state", reasonCode: "acquisition_transition_invalid" }] };
}

export const ACQUISITION_STATES = Object.freeze(Object.keys(NEXT) as AcquisitionState[]);
