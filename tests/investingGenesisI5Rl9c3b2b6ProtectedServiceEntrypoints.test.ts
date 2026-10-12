import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeResearchRunCommandV1,
} from "../lib/investing/research/researchExecutionService";
import {
  executeValidationChildCommandV1,
} from "../lib/investing/research/validationExecutionService";
import {
  isAuthorizedResearchExecutionContext,
  isAuthorizedResearchValidationChildExecutionContext,
  resolveAuthorizedResearchExecutionContext,
  resolveAuthorizedResearchValidationChildExecutionContext,
} from "../lib/investing/authority/context";
import { getInvestingAuthorityDatabase } from "../lib/investing/authority/transport";
import { createDeniedAndJournaledResearchMaterialProviderV1 } from "../lib/investing/research/deniedAndJournaledResearchMaterialProvider";
import { executeResearchRunV1 } from "../lib/investing/research/researchExecutionWriter";
import { executeValidationChildV1 } from "../lib/investing/research/validationExecutionWriter";

vi.mock("server-only",()=>({}));
vi.mock("../lib/investing/authority/context",()=>({
  isAuthorizedResearchExecutionContext:vi.fn(),
  isAuthorizedResearchValidationChildExecutionContext:vi.fn(),
  resolveAuthorizedResearchExecutionContext:vi.fn(),
  resolveAuthorizedResearchValidationChildExecutionContext:vi.fn(),
}));
vi.mock("../lib/investing/authority/transport",()=>({
  getInvestingAuthorityDatabase:vi.fn(),
}));
vi.mock("../lib/investing/research/deniedAndJournaledResearchMaterialProvider",()=>({
  createDeniedAndJournaledResearchMaterialProviderV1:vi.fn(),
}));
vi.mock("../lib/investing/research/researchExecutionWriter",()=>({
  executeResearchRunV1:vi.fn(),
}));
vi.mock("../lib/investing/research/validationExecutionWriter",()=>({
  createValidationProtocolV1:vi.fn(),
  executeValidationChildV1:vi.fn(),
}));

const investigation="11111111-1111-4111-8111-111111111111";
const runId="22222222-2222-4222-8222-222222222222";
const validationId="33333333-3333-4333-8333-333333333333";
const researchInput={
  researchInvestigationId:investigation,
  runInputIdentityId:runId,
  correlationId:"corr-b6-001",
};
const validationInput={
  researchInvestigationId:investigation,
  researchValidationProtocolIdentityId:validationId,
  foldOrdinal:"0",phase:"TRAINING" as const,
  correlationId:"corr-b6-002",
};
const researchContext={operation:"RESEARCH_EXECUTION_RUN_V1",tenantId:investigation};
const validationContext={operation:"RESEARCH_VALIDATION_CHILD_EXECUTE_V1",tenantId:investigation};

describe("RL-9C3B2B6 protected Research and Validation command boundaries",()=>{
  beforeEach(()=>{
    vi.resetAllMocks();
    vi.mocked(resolveAuthorizedResearchExecutionContext).mockResolvedValue({
      ok:true,context:researchContext as never,
    });
    vi.mocked(resolveAuthorizedResearchValidationChildExecutionContext).mockResolvedValue({
      ok:true,context:validationContext as never,
    });
    vi.mocked(isAuthorizedResearchExecutionContext).mockReturnValue(true);
    vi.mocked(isAuthorizedResearchValidationChildExecutionContext).mockReturnValue(true);
    const database={connect:vi.fn()};
    vi.mocked(getInvestingAuthorityDatabase).mockReturnValue(database as never);
    const denied={loadSeriesContent:vi.fn(async()=>{throw Error("RESEARCH_MATERIAL_ACCESS_UNPROVEN");})};
    vi.mocked(createDeniedAndJournaledResearchMaterialProviderV1).mockReturnValue(denied);
    vi.mocked(executeResearchRunV1).mockResolvedValue({ok:false,code:"UNAVAILABLE"});
    vi.mocked(executeValidationChildV1).mockResolvedValue({ok:false,code:"UNAVAILABLE"});
  });

  it("requires server-authorized Research and installs only the denial provider",async()=>{
    expect(await executeResearchRunCommandV1(researchInput)).toEqual({ok:false,code:"UNAVAILABLE"});
    expect(resolveAuthorizedResearchExecutionContext).toHaveBeenCalledWith(researchInput);
    expect(createDeniedAndJournaledResearchMaterialProviderV1).toHaveBeenCalledWith(
      researchContext,vi.mocked(getInvestingAuthorityDatabase).mock.results[0]?.value,
    );
    expect(vi.mocked(executeResearchRunV1).mock.calls[0]?.[0].datasetMaterialProvider)
      .toBe(vi.mocked(createDeniedAndJournaledResearchMaterialProviderV1).mock.results[0]?.value);
  });

  it("requires server-authorized Validation and installs only the denial provider",async()=>{
    expect(await executeValidationChildCommandV1(validationInput)).toEqual({ok:false,code:"UNAVAILABLE"});
    expect(resolveAuthorizedResearchValidationChildExecutionContext).toHaveBeenCalledWith(validationInput);
    expect(createDeniedAndJournaledResearchMaterialProviderV1).toHaveBeenCalledWith(
      validationContext,vi.mocked(getInvestingAuthorityDatabase).mock.results[0]?.value,
    );
    expect(vi.mocked(executeValidationChildV1).mock.calls[0]?.[0].datasetMaterialProvider)
      .toBe(vi.mocked(createDeniedAndJournaledResearchMaterialProviderV1).mock.results[0]?.value);
  });

  it("rejects a caller-supplied Research provider BEFORE authority/database/writer",async()=>{
    const reader=vi.fn(async()=>Buffer.from("forbidden material"));
    const input={...researchInput,datasetMaterialProvider:{loadSeriesContent:reader}};
    expect(await executeResearchRunCommandV1(input as never)).toEqual({
      ok:false,code:"FORBIDDEN_OR_NOT_FOUND",
    });
    expect(reader).not.toHaveBeenCalled();
    expect(resolveAuthorizedResearchExecutionContext).not.toHaveBeenCalled();
    expect(createDeniedAndJournaledResearchMaterialProviderV1).not.toHaveBeenCalled();
    expect(executeResearchRunV1).not.toHaveBeenCalled();
  });

  it("rejects a caller-supplied Validation provider BEFORE authority/database/writer",async()=>{
    const reader=vi.fn(async()=>Buffer.from("forbidden validation bytes"));
    const input={...validationInput,datasetMaterialProvider:{loadSeriesContent:reader}};
    expect(await executeValidationChildCommandV1(input as never)).toEqual({
      ok:false,code:"FORBIDDEN_OR_NOT_FOUND",
    });
    expect(reader).not.toHaveBeenCalled();
    expect(resolveAuthorizedResearchValidationChildExecutionContext).not.toHaveBeenCalled();
    expect(executeValidationChildV1).not.toHaveBeenCalled();
  });

  it("rejects forged authority, symbols and inherited security bypass fields",async()=>{
    for(const bad of [
      {...researchInput,tenantId:investigation},
      {...researchInput,authorizedContext:researchContext},
      {...researchInput,[Symbol("bypass")]:true},
      Object.assign(Object.create({provider:"untrusted"}),researchInput),
    ]) {
      expect(await executeResearchRunCommandV1(bad as never)).toEqual({
        ok:false,code:"FORBIDDEN_OR_NOT_FOUND",
      });
    }
    for(const bad of [
      {...validationInput,principalId:"wrong"},
      {...validationInput,readPolicy:"ALLOW"},
      Object.assign(Object.create({injected:true}),validationInput),
    ]) {
      expect(await executeValidationChildCommandV1(bad as never)).toEqual({
        ok:false,code:"FORBIDDEN_OR_NOT_FOUND",
      });
    }
    expect(resolveAuthorizedResearchExecutionContext).not.toHaveBeenCalled();
    expect(resolveAuthorizedResearchValidationChildExecutionContext).not.toHaveBeenCalled();
  });

  it("fails closed if server authority resolution is unavailable or not branded",async()=>{
    vi.mocked(resolveAuthorizedResearchExecutionContext).mockResolvedValue({
      ok:false,code:"INTERNAL_ERROR",
    } as never);
    vi.mocked(isAuthorizedResearchValidationChildExecutionContext).mockReturnValue(false);
    expect(await executeResearchRunCommandV1(researchInput)).toEqual({ok:false,code:"INTERNAL_ERROR"});
    expect(await executeValidationChildCommandV1(validationInput)).toEqual({
      ok:false,code:"FORBIDDEN_OR_NOT_FOUND",
    });
    expect(executeResearchRunV1).not.toHaveBeenCalled();
    expect(executeValidationChildV1).not.toHaveBeenCalled();
  });
});
