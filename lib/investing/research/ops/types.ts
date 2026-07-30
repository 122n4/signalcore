export const RESEARCH_OPS_SNAPSHOT_VERSION="investing-research-ops-snapshot/v1" as const;
export type ResearchOpsCategory="datasets"|"acquisition_jobs"|"scientific_jobs"|
 "experiments"|"failures"|"validation_reports"|"scientific_decisions"|"promotions";
export type ResearchOpsCount=Readonly<{category:ResearchOpsCategory;state:string;count:number}>;
export type ResearchOpsRecent=Readonly<{category:ResearchOpsCategory;id:string;
 state:string;occurredAt:string|null;reasonCode:string|null}>;
export type ResearchOpsSnapshot=Readonly<{contractVersion:typeof RESEARCH_OPS_SNAPSHOT_VERSION;
 scope:Readonly<{tenantId:string;ownerId:string;portfolioId:string;accountId:string}>;
 generatedAt:string;counts:readonly ResearchOpsCount[];recent:readonly ResearchOpsRecent[];
 notices:readonly ["read_only","no_scientific_decision_writes","no_ui_promotion"]}>;
