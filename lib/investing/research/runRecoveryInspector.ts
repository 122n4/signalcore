import "server-only";
import { readResearchPassportServiceV1 } from "./researchPassportService";
import type { ResearchPassportV1 } from "./researchPassportReader";

// An inspection is never a retry, lease, worker-liveness or mutating action.
// All rows originate from the existing owner-authorized Research Passport.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export function classifyResearchRunRecoveryV1(
  passport: Pick<ResearchPassportV1,"investigation"|"runInputs"|"executionRuns"|"results"|"evidence">,
) {
  if (!passport?.investigation || !uuid.test(passport.investigation.researchInvestigationId) ||
      !Array.isArray(passport.runInputs) || !Array.isArray(passport.executionRuns) ||
      !Array.isArray(passport.results) || !Array.isArray(passport.evidence) ||
      passport.executionRuns.length > 4096) throw Error("RECOVERY_SOURCE_INVALID");
  const inputs = new Set<string>();
  for (const item of passport.runInputs) {
    if (!item || !uuid.test(item.runInputIdentityId) || inputs.has(item.runInputIdentityId)) throw Error("RECOVERY_SOURCE_INVALID");
    inputs.add(item.runInputIdentityId);
  }
  const results = new Map<string,string>();
  for (const item of passport.results) {
    if (!item || !uuid.test(item.resultIdentityId) || !uuid.test(item.runInputIdentityId) ||
        results.has(item.resultIdentityId)) throw Error("RECOVERY_SOURCE_INVALID");
    results.set(item.resultIdentityId,item.runInputIdentityId);
  }
  const evidenceResultIds = new Set(passport.evidence.map(x=>x?.resultIdentityId));
  const seen = new Set<string>();
  const runs = passport.executionRuns.map(run=>{
    if (!run || !uuid.test(run.researchExecutionRunId) ||
        !uuid.test(run.runInputIdentityId) || !inputs.has(run.runInputIdentityId) ||
        seen.has(run.researchExecutionRunId) || !Array.isArray(run.events)) throw Error("RECOVERY_SOURCE_INVALID");
    seen.add(run.researchExecutionRunId);
    const t=run.terminalState;
    const states = t==="REGISTERED" ? ["REGISTERED"]
      : t==="STARTED" ? ["REGISTERED","STARTED"]
      : t==="SUCCEEDED"||t==="FAILED" ? ["REGISTERED","STARTED",t] : null;
    if (!states || run.events.length!==states.length ||
        run.events.some((e,i)=>!e || e.eventSequence!==i+1 || e.runStatus!==states[i] ||
          (i<states.length-1 && (e.resultIdentityId!==null || e.failureReasonCode!==null)))) throw Error("RECOVERY_SOURCE_INVALID");
    const last=run.events[run.events.length-1]!;
    if (t==="SUCCEEDED") {
      if (!run.resultIdentityId || !uuid.test(run.resultIdentityId) ||
          results.get(run.resultIdentityId)!==run.runInputIdentityId ||
          !evidenceResultIds.has(run.resultIdentityId) ||
          run.failureReasonCode!==null || last.resultIdentityId!==run.resultIdentityId ||
          last.failureReasonCode!==null) throw Error("RECOVERY_SOURCE_INVALID");
    } else if (t==="FAILED") {
      if (run.resultIdentityId!==null || !run.failureReasonCode ||
          last.failureReasonCode!==run.failureReasonCode || last.resultIdentityId!==null) throw Error("RECOVERY_SOURCE_INVALID");
    } else if (run.resultIdentityId!==null || run.failureReasonCode!==null) throw Error("RECOVERY_SOURCE_INVALID");
    const unresolved=t==="REGISTERED"||t==="STARTED";
    return Object.freeze({
      researchExecutionRunId:run.researchExecutionRunId,
      runInputIdentityId:run.runInputIdentityId,
      lastObservedState:t,
      recoveryState:unresolved ? "RECONCILIATION_REQUIRED" : t==="SUCCEEDED" ? "OBSERVED_SUCCEEDED" : "OBSERVED_FAILED",
      nextAction:unresolved ? "BLOCKED_MANUAL_RECONCILIATION" : "NO_RETRY",
      resultIdentityId:run.resultIdentityId,
      failureReasonCode:run.failureReasonCode,
    });
  }).sort((x,y)=>x.researchExecutionRunId<y.researchExecutionRunId?-1:x.researchExecutionRunId>y.researchExecutionRunId?1:0);
  return Object.freeze({
    schemaVersion:"RL10_RUN_RECOVERY_INSPECTION_V1" as const,
    researchInvestigationId:passport.investigation.researchInvestigationId,
    retryAuthorized:false as const,
    workerLiveness:"UNAVAILABLE" as const,
    runs:Object.freeze(runs),
  });
}
export async function inspectResearchRunRecoveryForCurrentUserV1(input:Readonly<{
  researchInvestigationId:string;correlationId:string;
}>) {
  const read=await readResearchPassportServiceV1(input);
  if (!read.ok) return read;
  if (read.passport.investigation.researchInvestigationId!==input.researchInvestigationId) {
    return {ok:false as const,code:"INTERNAL_ERROR" as const};
  }
  return {ok:true as const,inspection:classifyResearchRunRecoveryV1(read.passport)};
}
