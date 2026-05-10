import { readFile } from "node:fs/promises";

import { ensureResearchBaselineSnapshot } from "./baseline";
import { buildResearchCampaignMap, readResearchCampaignLibrary } from "./campaigns";
import { isResearchCandidateScopeCoverageEligible, readResearchCoverageEligibility } from "./dataQuality";
import { computeResearchTaskFingerprint, readFingerprintIndexEntry } from "./idempotency";
import { appendResearchTask, readResearchQueue, setResearchQueueIdleReason, writeResearchQueue } from "./queue";
import { readJsonIfExists, sanitizeFileSegment, writeJsonAtomic } from "./fs";
import type {
  ResearchCampaignDefinition,
  ResearchCandidateFamily,
  ResearchCandidateLibrary,
  ResearchCandidateTemplate,
  ResearchConfig,
  ResearchPlannerFuelCampaignStatus,
  ResearchPlannerFuelFamilyStatus,
  ResearchPlannerFuelStatus,
  ResearchPlannerResult,
  ResearchTask,
  ResearchTaskExecutorMap,
  ResearchTaskType,
} from "./types";

type RawIndexedTemplate = {
  family: ResearchCandidateFamily;
  template: ResearchCandidateTemplate;
  familyIndex: number;
  templateIndex: number;
};

type IndexedTemplate = RawIndexedTemplate & {
  campaign: ResearchCampaignDefinition;
};

type ResearchPlannerCampaignMemory = {
  rejectedOrFailedCount: number;
  completedCount: number;
  recentSelectionCount: number;
};

type ResearchPlannerFamilyMemory = {
  rejectedOrFailedCount: number;
  completedCount: number;
  recentSelectionCount: number;
};

type ResearchPlannerTemplateMemory = {
  rejectedOrFailedCount: number;
  completedCount: number;
  recentSelectionCount: number;
  recentRejectCount: number;
};

type ResearchPlannerMemory = {
  byCampaignId: Map<string, ResearchPlannerCampaignMemory>;
  byFamilyId: Map<string, ResearchPlannerFamilyMemory>;
  byTemplateId: Map<string, ResearchPlannerTemplateMemory>;
};

type ResearchPlannerQuotaConfig = {
  enabled: boolean;
  maxSelectionsPerWindow: number | null;
  decisionWindowSize: number | null;
};

type ResearchPlannerTemplateCooldownConfig = {
  enabled: boolean;
  maxRecentRejects: number | null;
  decisionWindowSize: number | null;
};

type DedupedIndexedTemplate = IndexedTemplate & {
  runFingerprint: string;
};

type ResearchPlannerAnalysis = {
  baselineId: string;
  activeLibrary: ResearchCandidateLibrary;
  reserveLibrary: ResearchCandidateLibrary | null;
  activeCampaigns: ResearchCampaignDefinition[];
  enabledTemplates: RawIndexedTemplate[];
  supportedTemplates: RawIndexedTemplate[];
  validProfileTemplates: RawIndexedTemplate[];
  compatibleTemplates: RawIndexedTemplate[];
  campaignQualifiedTemplates: IndexedTemplate[];
  dataQualityQualifiedTemplates: IndexedTemplate[];
  dedupedTemplates: DedupedIndexedTemplate[];
  templateCooldownTemplates: DedupedIndexedTemplate[];
  campaignQuotaTemplates: DedupedIndexedTemplate[];
  selectableTemplates: DedupedIndexedTemplate[];
  memory: ResearchPlannerMemory;
  templateCooldown: ResearchPlannerTemplateCooldownConfig & {
    constrained: boolean;
  };
  campaignQuota: ResearchPlannerQuotaConfig & {
    constrained: boolean;
  };
  quota: ResearchPlannerQuotaConfig & {
    constrained: boolean;
  };
};

function assertValidCandidateLibrary(
  input: unknown,
): asserts input is ResearchCandidateLibrary {
  if (!input || typeof input !== "object") {
    throw new Error("Candidate library must be an object.");
  }

  const library = input as ResearchCandidateLibrary;
  if (library.version !== 1) {
    throw new Error(`Unsupported candidate library version '${String(library.version)}'.`);
  }
  if (!Array.isArray(library.families)) {
    throw new Error("Candidate library families must be an array.");
  }

  for (const family of library.families) {
    if (!family || typeof family !== "object") {
      throw new Error("Candidate family must be an object.");
    }
    if (typeof family.id !== "string" || family.id.trim().length === 0) {
      throw new Error("Candidate family is missing id.");
    }
    if (typeof family.enabled !== "boolean") {
      throw new Error(`Candidate family '${family.id}' is missing enabled.`);
    }
    if (typeof family.priority !== "number") {
      throw new Error(`Candidate family '${family.id}' is missing numeric priority.`);
    }
    if (!Array.isArray(family.templates)) {
      throw new Error(`Candidate family '${family.id}' templates must be an array.`);
    }
    for (const template of family.templates) {
      if (!template || typeof template !== "object") {
        throw new Error(`Candidate family '${family.id}' contains an invalid template.`);
      }
      if (typeof template.id !== "string" || template.id.trim().length === 0) {
        throw new Error(`Candidate family '${family.id}' has a template without id.`);
      }
      if (typeof template.enabled !== "boolean") {
        throw new Error(`Candidate template '${template.id}' is missing enabled.`);
      }
      if (typeof template.priority !== "number") {
        throw new Error(`Candidate template '${template.id}' is missing numeric priority.`);
      }
    }
  }
}

async function readCandidateLibrary(config: ResearchConfig): Promise<ResearchCandidateLibrary> {
  const library =
    (await readJsonIfExists<ResearchCandidateLibrary>(config.paths.candidateLibraryPath)) ?? {
      version: 1,
      families: [],
    };
  assertValidCandidateLibrary(library);
  return library;
}

async function readCandidateLibraryFromPath(targetPath: string | undefined): Promise<ResearchCandidateLibrary | null> {
  if (!targetPath) {
    return null;
  }

  const library = await readJsonIfExists<ResearchCandidateLibrary>(targetPath);
  if (!library) {
    return null;
  }
  assertValidCandidateLibrary(library);
  return library;
}

function countTemplates(library: ResearchCandidateLibrary | null): number {
  if (!library) {
    return 0;
  }
  return library.families.reduce((total, family) => total + family.templates.length, 0);
}

function resolvePlannerQuotaConfig(config: ResearchConfig): ResearchPlannerQuotaConfig {
  const quota = config.automation.familyQuota;
  if (!quota?.enabled) {
    return {
      enabled: false,
      maxSelectionsPerWindow: null,
      decisionWindowSize: null,
    };
  }

  const maxSelectionsPerWindow = Number.isFinite(quota.maxSelectionsPerWindow)
    ? Math.max(1, Math.floor(quota.maxSelectionsPerWindow))
    : 1;
  const decisionWindowSize = Number.isFinite(quota.decisionWindowSize)
    ? Math.max(1, Math.floor(quota.decisionWindowSize))
    : maxSelectionsPerWindow;

  return {
    enabled: true,
    maxSelectionsPerWindow,
    decisionWindowSize,
  };
}

function resolvePlannerCampaignQuotaConfig(config: ResearchConfig): ResearchPlannerQuotaConfig {
  const quota = config.automation.campaignQuota;
  if (!quota?.enabled) {
    return {
      enabled: false,
      maxSelectionsPerWindow: null,
      decisionWindowSize: null,
    };
  }

  const maxSelectionsPerWindow = Number.isFinite(quota.maxSelectionsPerWindow)
    ? Math.max(1, Math.floor(quota.maxSelectionsPerWindow))
    : 1;
  const decisionWindowSize = Number.isFinite(quota.decisionWindowSize)
    ? Math.max(1, Math.floor(quota.decisionWindowSize))
    : maxSelectionsPerWindow;

  return {
    enabled: true,
    maxSelectionsPerWindow,
    decisionWindowSize,
  };
}

function resolvePlannerTemplateCooldownConfig(config: ResearchConfig): ResearchPlannerTemplateCooldownConfig {
  const cooldown = config.automation.templateCooldown;
  if (!cooldown?.enabled) {
    return {
      enabled: false,
      maxRecentRejects: null,
      decisionWindowSize: null,
    };
  }

  const maxRecentRejects = Number.isFinite(cooldown.maxRecentRejects)
    ? Math.max(1, Math.floor(cooldown.maxRecentRejects))
    : 1;
  const decisionWindowSize = Number.isFinite(cooldown.decisionWindowSize)
    ? Math.max(1, Math.floor(cooldown.decisionWindowSize))
    : maxRecentRejects;

  return {
    enabled: true,
    maxRecentRejects,
    decisionWindowSize,
  };
}

async function replenishCandidateLibraryFromReserve(config: ResearchConfig): Promise<number> {
  const reserveLibrary = await readCandidateLibraryFromPath(config.paths.candidateReserveLibraryPath);
  if (!reserveLibrary || reserveLibrary.families.length === 0) {
    return 0;
  }

  const activeLibrary = await readCandidateLibrary(config);
  const activeFamilyById = new Map(
    activeLibrary.families.map((family) => [family.id, family] as const),
  );

  let additions = 0;
  const maxAdditions = 12;

  for (const reserveFamily of reserveLibrary.families) {
    if (!reserveFamily.enabled) {
      continue;
    }

    let activeFamily = activeFamilyById.get(reserveFamily.id);
    if (!activeFamily) {
      activeFamily = {
        id: reserveFamily.id,
        enabled: reserveFamily.enabled,
        priority: reserveFamily.priority,
        campaign_id: reserveFamily.campaign_id,
        templates: [],
      };
      activeLibrary.families.push(activeFamily);
      activeFamilyById.set(activeFamily.id, activeFamily);
    } else if (!activeFamily.campaign_id && reserveFamily.campaign_id) {
      activeFamily.campaign_id = reserveFamily.campaign_id;
    }

    const existingTemplateIds = new Set(activeFamily.templates.map((template) => template.id));
    for (const reserveTemplate of reserveFamily.templates) {
      if (!reserveTemplate.enabled || existingTemplateIds.has(reserveTemplate.id)) {
        continue;
      }

      activeFamily.templates.push(reserveTemplate);
      existingTemplateIds.add(reserveTemplate.id);
      additions += 1;

      if (additions >= maxAdditions) {
        break;
      }
    }

    if (additions >= maxAdditions) {
      break;
    }
  }

  if (additions > 0) {
    await writeResearchQueue(
      config,
      setResearchQueueIdleReason(await readResearchQueue(config), null),
    );
    await writeJsonAtomic(config.paths.candidateLibraryPath, activeLibrary);
  }

  return additions;
}

function defaultEngineScopeForType(type: ResearchTaskType): ResearchTask["engine_scope"] {
  switch (type) {
    case "risk_shaping":
      return {
        allowed_files: [
          "lib/trading/backtest/**",
          "lib/trading/execution/riskFraming.ts",
          "lib/trading/playbook/**",
        ],
        live_mutation_allowed: false,
      };
    case "context_filter":
      return {
        allowed_files: [
          "lib/trading/backtest/**",
          "lib/trading/playbook/**",
        ],
        live_mutation_allowed: false,
      };
    default:
      return {
        allowed_files: ["lib/trading/backtest/**"],
        live_mutation_allowed: false,
      };
  }
}

function createTaskId(templateId: string, timestamp: string): string {
  return `task-auto-${sanitizeFileSegment(templateId)}-${sanitizeFileSegment(timestamp)}`;
}

function createTaskFromTemplate(args: {
  baselineId: string;
  campaign: ResearchCampaignDefinition;
  family: ResearchCandidateFamily;
  template: ResearchCandidateTemplate;
  runFingerprint: string;
  now: Date;
}): ResearchTask {
  const createdAt = args.now.toISOString();
  return {
    id: createTaskId(args.template.id, createdAt),
    type: args.template.type,
    status: "pending",
    priority: args.family.priority * 1000 + args.template.priority,
    created_at: createdAt,
    started_at: null,
    finished_at: null,
    attempt: 0,
    max_attempts: 2,
    retryable: true,
    baseline_id: args.baselineId,
    dataset_profile: args.template.dataset_profile,
    validation_profile: args.template.validation_profile,
    depends_on: [],
    candidate_scope: args.template.candidate_scope,
    candidate_mutation: args.template.candidate_mutation,
    engine_scope: defaultEngineScopeForType(args.template.type),
    run_fingerprint: args.runFingerprint,
    last_run_id: null,
    decision: null,
    decision_reason: null,
    error: null,
    notes: `Auto-enqueued from candidate library template '${args.template.id}'.`,
    planner_source: {
      campaign_id: args.campaign.id,
      campaign_objective: args.campaign.objective,
      family_id: args.family.id,
      template_id: args.template.id,
      auto_enqueued: true,
    },
  };
}

async function readLedgerFingerprints(
  config: ResearchConfig,
  baselineId: string,
): Promise<Set<string>> {
  const fingerprints = new Set<string>();

  try {
    const raw = await readFile(config.paths.decisionsPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      if (line.trim().length === 0) {
        continue;
      }
      const entry = JSON.parse(line) as {
        baseline_id?: string;
        run_fingerprint?: string;
      };
      if (entry.baseline_id === baselineId && typeof entry.run_fingerprint === "string") {
        fingerprints.add(entry.run_fingerprint);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return fingerprints;
}

async function buildPlannerMemory(args: {
  config: ResearchConfig;
  baselineId: string;
  quota: ResearchPlannerQuotaConfig;
  campaignQuota: ResearchPlannerQuotaConfig;
  templateCooldown: ResearchPlannerTemplateCooldownConfig;
}): Promise<ResearchPlannerMemory> {
  const byCampaignId = new Map<string, ResearchPlannerCampaignMemory>();
  const byFamilyId = new Map<string, ResearchPlannerFamilyMemory>();
  const byTemplateId = new Map<string, ResearchPlannerTemplateMemory>();
  const recentSelections: string[] = [];
  const recentCampaignSelections: string[] = [];
  const recentTemplateSelections: string[] = [];
  const recentTemplateRejects: string[] = [];

  const bumpCampaign = (campaignId: string, kind: "completed" | "rejectedOrFailed") => {
    const current = byCampaignId.get(campaignId) ?? {
      rejectedOrFailedCount: 0,
      completedCount: 0,
      recentSelectionCount: 0,
    };
    if (kind === "completed") {
      current.completedCount += 1;
    } else {
      current.rejectedOrFailedCount += 1;
    }
    byCampaignId.set(campaignId, current);
  };

  const bump = (familyId: string, kind: "completed" | "rejectedOrFailed") => {
    const current = byFamilyId.get(familyId) ?? {
      rejectedOrFailedCount: 0,
      completedCount: 0,
      recentSelectionCount: 0,
    };
    if (kind === "completed") {
      current.completedCount += 1;
    } else {
      current.rejectedOrFailedCount += 1;
    }
    byFamilyId.set(familyId, current);
  };

  const bumpTemplate = (templateId: string, kind: "completed" | "rejectedOrFailed") => {
    const current = byTemplateId.get(templateId) ?? {
      rejectedOrFailedCount: 0,
      completedCount: 0,
      recentSelectionCount: 0,
      recentRejectCount: 0,
    };
    if (kind === "completed") {
      current.completedCount += 1;
    } else {
      current.rejectedOrFailedCount += 1;
    }
    byTemplateId.set(templateId, current);
  };

  try {
    const raw = await readFile(args.config.paths.decisionsPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      if (line.trim().length === 0) {
        continue;
      }
      const entry = JSON.parse(line) as {
        baseline_id?: string;
        decision?: string;
        planner_family_id?: string | null;
        planner_campaign_id?: string | null;
        planner_template_id?: string | null;
      };
      if (
        entry.baseline_id !== args.baselineId
      ) {
        continue;
      }
      const familyId =
        typeof entry.planner_family_id === "string" && entry.planner_family_id.trim().length > 0
          ? entry.planner_family_id
          : null;
      const campaignId =
        typeof entry.planner_campaign_id === "string" && entry.planner_campaign_id.trim().length > 0
          ? entry.planner_campaign_id
          : null;
      const templateId =
        typeof entry.planner_template_id === "string" && entry.planner_template_id.trim().length > 0
          ? entry.planner_template_id
          : null;
      if (entry.decision === "reject" || entry.decision === "failed") {
        if (familyId) {
          bump(familyId, "rejectedOrFailed");
        }
        if (campaignId) {
          bumpCampaign(campaignId, "rejectedOrFailed");
        }
        if (templateId) {
          bumpTemplate(templateId, "rejectedOrFailed");
          recentTemplateRejects.push(templateId);
        }
      } else if (
        entry.decision === "candidate" ||
        entry.decision === "promote"
      ) {
        if (familyId) {
          bump(familyId, "completed");
        }
        if (campaignId) {
          bumpCampaign(campaignId, "completed");
        }
        if (templateId) {
          bumpTemplate(templateId, "completed");
        }
      }
      if (familyId) {
        recentSelections.push(familyId);
      }
      if (campaignId) {
        recentCampaignSelections.push(campaignId);
      }
      if (templateId) {
        recentTemplateSelections.push(templateId);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  if (args.quota.enabled && (args.quota.decisionWindowSize ?? 0) > 0) {
    for (const familyId of recentSelections.slice(-(args.quota.decisionWindowSize ?? 0))) {
      const current = byFamilyId.get(familyId) ?? {
        rejectedOrFailedCount: 0,
        completedCount: 0,
        recentSelectionCount: 0,
      };
      current.recentSelectionCount += 1;
      byFamilyId.set(familyId, current);
    }
  }

  if (args.campaignQuota.enabled && (args.campaignQuota.decisionWindowSize ?? 0) > 0) {
    for (const campaignId of recentCampaignSelections.slice(-(args.campaignQuota.decisionWindowSize ?? 0))) {
      const current = byCampaignId.get(campaignId) ?? {
        rejectedOrFailedCount: 0,
        completedCount: 0,
        recentSelectionCount: 0,
      };
      current.recentSelectionCount += 1;
      byCampaignId.set(campaignId, current);
    }
  }

  const templateWindowSize = Math.max(
    args.quota.decisionWindowSize ?? 0,
    args.campaignQuota.decisionWindowSize ?? 0,
    args.templateCooldown.decisionWindowSize ?? 0,
  );

  if (templateWindowSize > 0) {
    for (const templateId of recentTemplateSelections.slice(-templateWindowSize)) {
      const current = byTemplateId.get(templateId) ?? {
        rejectedOrFailedCount: 0,
        completedCount: 0,
        recentSelectionCount: 0,
        recentRejectCount: 0,
      };
      current.recentSelectionCount += 1;
      byTemplateId.set(templateId, current);
    }
  }

  if (args.templateCooldown.enabled && (args.templateCooldown.decisionWindowSize ?? 0) > 0) {
    for (const templateId of recentTemplateRejects.slice(-(args.templateCooldown.decisionWindowSize ?? 0))) {
      const current = byTemplateId.get(templateId) ?? {
        rejectedOrFailedCount: 0,
        completedCount: 0,
        recentSelectionCount: 0,
        recentRejectCount: 0,
      };
      current.recentRejectCount += 1;
      byTemplateId.set(templateId, current);
    }
  }

  return { byCampaignId, byFamilyId, byTemplateId };
}

async function buildQueueFingerprints(args: {
  config: ResearchConfig;
  baselineId: string;
}): Promise<Set<string>> {
  const queue = await readResearchQueue(args.config);
  const baseline = await ensureResearchBaselineSnapshot(args.config);
  const fingerprints = new Set<string>();

  for (const task of queue.tasks) {
    if (
      task.baseline_id !== args.baselineId ||
      task.status === "cancelled"
    ) {
      continue;
    }

    if (task.run_fingerprint) {
      fingerprints.add(task.run_fingerprint);
      continue;
    }

    fingerprints.add(
      computeResearchTaskFingerprint({
        task,
        baselineId: baseline.manifest.baseline_id,
        datasetManifestHash: baseline.manifest.dataset_manifest_hash,
        engineManifestHash: baseline.manifest.engine_manifest_hash,
        validationProfileId: task.validation_profile,
        studyConfig: args.config.study,
      }),
    );
  }

  return fingerprints;
}

function sortIndexedTemplates(
  left: IndexedTemplate,
  right: IndexedTemplate,
  memory: ResearchPlannerMemory,
): number {
  const leftCampaignMemory = memory.byCampaignId.get(left.campaign.id) ?? {
    rejectedOrFailedCount: 0,
    completedCount: 0,
    recentSelectionCount: 0,
  };
  const rightCampaignMemory = memory.byCampaignId.get(right.campaign.id) ?? {
    rejectedOrFailedCount: 0,
    completedCount: 0,
    recentSelectionCount: 0,
  };
  const leftMemory = memory.byFamilyId.get(left.family.id) ?? {
    rejectedOrFailedCount: 0,
    completedCount: 0,
    recentSelectionCount: 0,
  };
  const rightMemory = memory.byFamilyId.get(right.family.id) ?? {
    rejectedOrFailedCount: 0,
    completedCount: 0,
    recentSelectionCount: 0,
  };
  const leftTemplateMemory = memory.byTemplateId.get(left.template.id) ?? {
    rejectedOrFailedCount: 0,
    completedCount: 0,
    recentSelectionCount: 0,
    recentRejectCount: 0,
  };
  const rightTemplateMemory = memory.byTemplateId.get(right.template.id) ?? {
    rejectedOrFailedCount: 0,
    completedCount: 0,
    recentSelectionCount: 0,
    recentRejectCount: 0,
  };

  if (leftCampaignMemory.rejectedOrFailedCount !== rightCampaignMemory.rejectedOrFailedCount) {
    return leftCampaignMemory.rejectedOrFailedCount - rightCampaignMemory.rejectedOrFailedCount;
  }
  if (leftCampaignMemory.completedCount !== rightCampaignMemory.completedCount) {
    return rightCampaignMemory.completedCount - leftCampaignMemory.completedCount;
  }
  if (left.campaign.priority !== right.campaign.priority) {
    return right.campaign.priority - left.campaign.priority;
  }
  if (leftMemory.rejectedOrFailedCount !== rightMemory.rejectedOrFailedCount) {
    return leftMemory.rejectedOrFailedCount - rightMemory.rejectedOrFailedCount;
  }
  if (leftMemory.completedCount !== rightMemory.completedCount) {
    return rightMemory.completedCount - leftMemory.completedCount;
  }
  if (left.family.priority !== right.family.priority) {
    return right.family.priority - left.family.priority;
  }
  if (leftTemplateMemory.recentRejectCount !== rightTemplateMemory.recentRejectCount) {
    return leftTemplateMemory.recentRejectCount - rightTemplateMemory.recentRejectCount;
  }
  if (leftTemplateMemory.rejectedOrFailedCount !== rightTemplateMemory.rejectedOrFailedCount) {
    return leftTemplateMemory.rejectedOrFailedCount - rightTemplateMemory.rejectedOrFailedCount;
  }
  if (leftTemplateMemory.completedCount !== rightTemplateMemory.completedCount) {
    return rightTemplateMemory.completedCount - leftTemplateMemory.completedCount;
  }
  if (left.template.priority !== right.template.priority) {
    return right.template.priority - left.template.priority;
  }
  if (left.familyIndex !== right.familyIndex) {
    return left.familyIndex - right.familyIndex;
  }
  if (left.templateIndex !== right.templateIndex) {
    return left.templateIndex - right.templateIndex;
  }
  return left.template.id.localeCompare(right.template.id);
}

function applyFamilyQuota(args: {
  templates: DedupedIndexedTemplate[];
  memory: ResearchPlannerMemory;
  quota: ResearchPlannerQuotaConfig;
}): {
  templates: DedupedIndexedTemplate[];
  constrained: boolean;
} {
  if (!args.quota.enabled || !args.quota.maxSelectionsPerWindow) {
    return {
      templates: args.templates,
      constrained: false,
    };
  }

  const underQuotaTemplates = args.templates.filter((candidate) => {
    const recentSelectionCount =
      args.memory.byFamilyId.get(candidate.family.id)?.recentSelectionCount ?? 0;
    return recentSelectionCount < args.quota.maxSelectionsPerWindow;
  });

  if (underQuotaTemplates.length === 0) {
    return {
      templates: args.templates,
      constrained: false,
    };
  }

  return {
    templates: underQuotaTemplates,
    constrained: underQuotaTemplates.length !== args.templates.length,
  };
}

function applyTemplateCooldown(args: {
  templates: DedupedIndexedTemplate[];
  memory: ResearchPlannerMemory;
  cooldown: ResearchPlannerTemplateCooldownConfig;
}): {
  templates: DedupedIndexedTemplate[];
  constrained: boolean;
} {
  if (!args.cooldown.enabled || !args.cooldown.maxRecentRejects) {
    return {
      templates: args.templates,
      constrained: false,
    };
  }

  const cooledTemplates = args.templates.filter((candidate) => {
    const recentRejectCount =
      args.memory.byTemplateId.get(candidate.template.id)?.recentRejectCount ?? 0;
    return recentRejectCount < args.cooldown.maxRecentRejects;
  });

  if (cooledTemplates.length === 0) {
    return {
      templates: args.templates,
      constrained: false,
    };
  }

  return {
    templates: cooledTemplates,
    constrained: cooledTemplates.length !== args.templates.length,
  };
}

function applyCampaignQuota(args: {
  templates: DedupedIndexedTemplate[];
  memory: ResearchPlannerMemory;
  quota: ResearchPlannerQuotaConfig;
}): {
  templates: DedupedIndexedTemplate[];
  constrained: boolean;
} {
  if (!args.quota.enabled || !args.quota.maxSelectionsPerWindow) {
    return {
      templates: args.templates,
      constrained: false,
    };
  }

  const underQuotaTemplates = args.templates.filter((candidate) => {
    const recentSelectionCount =
      args.memory.byCampaignId.get(candidate.campaign.id)?.recentSelectionCount ?? 0;
    return recentSelectionCount < args.quota.maxSelectionsPerWindow;
  });

  if (underQuotaTemplates.length === 0) {
    return {
      templates: args.templates,
      constrained: false,
    };
  }

  return {
    templates: underQuotaTemplates,
    constrained: underQuotaTemplates.length !== args.templates.length,
  };
}

async function analyzePlannerCandidates(args: {
  config: ResearchConfig;
  supportedTypes: Set<ResearchTaskType>;
}): Promise<ResearchPlannerAnalysis> {
  const baseline = await ensureResearchBaselineSnapshot(args.config);
  const activeLibrary = await readCandidateLibrary(args.config);
  const reserveLibrary = await readCandidateLibraryFromPath(args.config.paths.candidateReserveLibraryPath);
  const campaignLibrary = await readResearchCampaignLibrary(args.config);
  const campaignById = buildResearchCampaignMap(campaignLibrary);
  const rawIndexedTemplates = activeLibrary.families.flatMap((family, familyIndex) =>
    family.templates.map((template, templateIndex) => ({
      family,
      template,
      familyIndex,
      templateIndex,
    })),
  );

  const enabledTemplates = rawIndexedTemplates.filter(
    ({ family, template }) => family.enabled && template.enabled,
  );
  const supportedTemplates = enabledTemplates.filter(({ template }) =>
    args.supportedTypes.has(template.type),
  );
  const validProfileTemplates = supportedTemplates.filter(
    ({ template }) => template.validation_profile in args.config.validationProfiles,
  );
  const compatibleTemplates = validProfileTemplates.filter(
    ({ template }) => template.dataset_profile === baseline.manifest.dataset_profile,
  );
  const campaignQualifiedTemplates = compatibleTemplates.flatMap((candidate) => {
    const campaignId = candidate.template.campaign_id ?? candidate.family.campaign_id ?? null;
    const campaign = campaignId ? campaignById.get(campaignId) ?? null : null;
    if (!campaign || !campaign.enabled) {
      return [];
    }
    return [
      {
        ...candidate,
        campaign,
      },
    ];
  });

  const coverageEligibility = await readResearchCoverageEligibility(args.config);
  const dataQualityQualifiedTemplates = campaignQualifiedTemplates.filter(({ template }) =>
    isResearchCandidateScopeCoverageEligible({
      instruments: template.candidate_scope.instruments,
      coverage: coverageEligibility,
    }),
  );

  const queueFingerprints = await buildQueueFingerprints({
    config: args.config,
    baselineId: baseline.manifest.baseline_id,
  });
  const ledgerFingerprints = await readLedgerFingerprints(args.config, baseline.manifest.baseline_id);
  const templateCooldown = resolvePlannerTemplateCooldownConfig(args.config);
  const campaignQuota = resolvePlannerCampaignQuotaConfig(args.config);
  const quota = resolvePlannerQuotaConfig(args.config);
  const memory = await buildPlannerMemory({
    config: args.config,
    baselineId: baseline.manifest.baseline_id,
    templateCooldown,
    campaignQuota,
    quota,
  });

  const dedupedTemplates: DedupedIndexedTemplate[] = [];
  for (const candidate of dataQualityQualifiedTemplates) {
    const fingerprintTask = {
      type: candidate.template.type,
      baseline_id: baseline.manifest.baseline_id,
      dataset_profile: candidate.template.dataset_profile,
      validation_profile: candidate.template.validation_profile,
      candidate_scope: candidate.template.candidate_scope,
      candidate_mutation: candidate.template.candidate_mutation,
    };
    const fingerprint = computeResearchTaskFingerprint({
      task: fingerprintTask,
      baselineId: baseline.manifest.baseline_id,
      datasetManifestHash: baseline.manifest.dataset_manifest_hash,
      engineManifestHash: baseline.manifest.engine_manifest_hash,
      validationProfileId: candidate.template.validation_profile,
      studyConfig: args.config.study,
    });

    if (queueFingerprints.has(fingerprint) || ledgerFingerprints.has(fingerprint)) {
      continue;
    }

    const existingRun = await readFingerprintIndexEntry(args.config, fingerprint);
    if (existingRun) {
      continue;
    }

    dedupedTemplates.push({
      ...candidate,
      runFingerprint: fingerprint,
    });
  }

  const templateCooldownResult = applyTemplateCooldown({
    templates: dedupedTemplates,
    memory,
    cooldown: templateCooldown,
  });
  const campaignQuotaResult = applyCampaignQuota({
    templates: templateCooldownResult.templates,
    memory,
    quota: campaignQuota,
  });
  const quotaResult = applyFamilyQuota({
    templates: campaignQuotaResult.templates,
    memory,
    quota,
  });

  return {
    baselineId: baseline.manifest.baseline_id,
    activeLibrary,
    reserveLibrary,
    activeCampaigns: campaignLibrary.campaigns.filter((campaign) => campaign.enabled),
    enabledTemplates,
    supportedTemplates,
    validProfileTemplates,
    compatibleTemplates,
    campaignQualifiedTemplates,
    dataQualityQualifiedTemplates,
    dedupedTemplates,
    templateCooldownTemplates: templateCooldownResult.templates,
    campaignQuotaTemplates: campaignQuotaResult.templates,
    selectableTemplates: quotaResult.templates,
    memory,
    templateCooldown: {
      ...templateCooldown,
      constrained: templateCooldownResult.constrained,
    },
    campaignQuota: {
      ...campaignQuota,
      constrained: campaignQuotaResult.constrained,
    },
    quota: {
      ...quota,
      constrained: quotaResult.constrained,
    },
  };
}

export async function buildResearchPlannerFuelStatus(args: {
  config: ResearchConfig;
  supportedTypes: Set<ResearchTaskType>;
}): Promise<ResearchPlannerFuelStatus> {
  const analysis = await analyzePlannerCandidates(args);
  const campaignStats = new Map<string, ResearchPlannerFuelCampaignStatus>();
  const familyStats = new Map<string, ResearchPlannerFuelFamilyStatus>();

  const upsertCampaign = (
    campaign: ResearchCampaignDefinition,
    mutate?: (current: ResearchPlannerFuelCampaignStatus) => void,
  ) => {
    const existing = campaignStats.get(campaign.id) ?? {
      campaign_id: campaign.id,
      objective: campaign.objective,
      priority: campaign.priority,
      enabled: campaign.enabled,
      total_templates: 0,
      selectable_templates: 0,
      recent_selection_count: analysis.memory.byCampaignId.get(campaign.id)?.recentSelectionCount ?? 0,
      rejected_or_failed_count: analysis.memory.byCampaignId.get(campaign.id)?.rejectedOrFailedCount ?? 0,
      completed_count: analysis.memory.byCampaignId.get(campaign.id)?.completedCount ?? 0,
      under_quota:
        analysis.campaignQuota.enabled && analysis.campaignQuota.maxSelectionsPerWindow
          ? (analysis.memory.byCampaignId.get(campaign.id)?.recentSelectionCount ?? 0) <
            analysis.campaignQuota.maxSelectionsPerWindow
          : null,
    };
    if (mutate) {
      mutate(existing);
    }
    campaignStats.set(campaign.id, existing);
  };

  const upsertFamily = (
    familyId: string,
    source: "active" | "reserve",
    mutate?: (current: ResearchPlannerFuelFamilyStatus) => void,
  ) => {
    const existing = familyStats.get(`${source}:${familyId}`) ?? {
      family_id: familyId,
      source,
      total_templates: 0,
      enabled_templates: 0,
      selectable_templates: 0,
      recent_selection_count: analysis.memory.byFamilyId.get(familyId)?.recentSelectionCount ?? 0,
      rejected_or_failed_count: analysis.memory.byFamilyId.get(familyId)?.rejectedOrFailedCount ?? 0,
      completed_count: analysis.memory.byFamilyId.get(familyId)?.completedCount ?? 0,
      under_quota:
        analysis.quota.enabled && analysis.quota.maxSelectionsPerWindow
          ? (analysis.memory.byFamilyId.get(familyId)?.recentSelectionCount ?? 0) <
            analysis.quota.maxSelectionsPerWindow
          : null,
    };
    if (mutate) {
      mutate(existing);
    }
    familyStats.set(`${source}:${familyId}`, existing);
  };

  for (const family of analysis.activeLibrary.families) {
    upsertFamily(family.id, "active", (current) => {
      current.total_templates = family.templates.length;
      current.enabled_templates = family.templates.filter((template) => template.enabled).length;
    });
  }

  for (const family of analysis.reserveLibrary?.families ?? []) {
    upsertFamily(family.id, "reserve", (current) => {
      current.total_templates = family.templates.length;
      current.enabled_templates = family.templates.filter((template) => template.enabled).length;
    });
  }

  for (const candidate of analysis.selectableTemplates) {
    upsertCampaign(candidate.campaign, (current) => {
      current.selectable_templates += 1;
    });
    upsertFamily(candidate.family.id, "active", (current) => {
      current.selectable_templates += 1;
    });
  }

  for (const campaign of analysis.activeCampaigns) {
    upsertCampaign(campaign, (current) => {
      current.total_templates = analysis.campaignQualifiedTemplates.filter(
        (candidate) => candidate.campaign.id === campaign.id,
      ).length;
    });
  }

  return {
    baseline_id: analysis.baselineId,
    active_family_count: analysis.activeLibrary.families.length,
    active_template_count: countTemplates(analysis.activeLibrary),
    active_campaign_count: analysis.activeCampaigns.length,
    reserve_family_count: analysis.reserveLibrary?.families.length ?? 0,
    reserve_template_count: countTemplates(analysis.reserveLibrary),
    enabled_campaign_count: analysis.activeCampaigns.length,
    enabled_template_count: analysis.enabledTemplates.length,
    supported_template_count: analysis.supportedTemplates.length,
    valid_profile_template_count: analysis.validProfileTemplates.length,
    compatible_template_count: analysis.compatibleTemplates.length,
    campaign_qualified_template_count: analysis.campaignQualifiedTemplates.length,
    data_quality_qualified_template_count: analysis.dataQualityQualifiedTemplates.length,
    deduped_template_count: analysis.dedupedTemplates.length,
    selectable_template_count: analysis.selectableTemplates.length,
    selectable_campaign_count: [...campaignStats.values()].filter((campaign) => campaign.selectable_templates > 0).length,
    blocked_by_campaign_count:
      analysis.compatibleTemplates.length - analysis.campaignQualifiedTemplates.length,
    blocked_by_data_quality_count:
      analysis.campaignQualifiedTemplates.length - analysis.dataQualityQualifiedTemplates.length,
    blocked_by_dedupe_count:
      analysis.dataQualityQualifiedTemplates.length - analysis.dedupedTemplates.length,
    blocked_by_template_cooldown_count: analysis.templateCooldown.constrained
      ? analysis.dedupedTemplates.length - analysis.templateCooldownTemplates.length
      : 0,
    blocked_by_quota_count:
      (analysis.campaignQuota.constrained || analysis.quota.constrained)
        ? analysis.templateCooldownTemplates.length - analysis.selectableTemplates.length
        : 0,
    template_cooldown: {
      enabled: analysis.templateCooldown.enabled,
      max_recent_rejects: analysis.templateCooldown.maxRecentRejects,
      decision_window_size: analysis.templateCooldown.decisionWindowSize,
      constrained: analysis.templateCooldown.constrained,
    },
    campaign_quota: {
      enabled: analysis.campaignQuota.enabled,
      max_selections_per_window: analysis.campaignQuota.maxSelectionsPerWindow,
      decision_window_size: analysis.campaignQuota.decisionWindowSize,
      constrained: analysis.campaignQuota.constrained,
    },
    quota: {
      enabled: analysis.quota.enabled,
      max_selections_per_window: analysis.quota.maxSelectionsPerWindow,
      decision_window_size: analysis.quota.decisionWindowSize,
      constrained: analysis.quota.constrained,
    },
    campaigns: [...campaignStats.values()].sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return left.campaign_id.localeCompare(right.campaign_id);
    }),
    families: [...familyStats.values()].sort((left, right) => {
      if (left.source !== right.source) {
        return left.source.localeCompare(right.source);
      }
      return left.family_id.localeCompare(right.family_id);
    }),
  };
}

export async function autoEnqueueNextResearchTask(args: {
  config: ResearchConfig;
  supportedTypes: Set<ResearchTaskType>;
  now?: () => Date;
  allowReserveRefill?: boolean;
}): Promise<ResearchPlannerResult> {
  const now = args.now ?? (() => new Date());
  const allowReserveRefill = args.allowReserveRefill ?? true;
  const queue = await readResearchQueue(args.config);
  const library = await readCandidateLibrary(args.config);

  if (library.families.length === 0) {
    if (allowReserveRefill && (await replenishCandidateLibraryFromReserve(args.config)) > 0) {
      return autoEnqueueNextResearchTask({
        ...args,
        allowReserveRefill: false,
      });
    }
    await writeResearchQueue(args.config, setResearchQueueIdleReason(queue, "candidate_library_empty"));
    return { action: "idle", reason: "candidate_library_empty" };
  }

  const analysis = await analyzePlannerCandidates({
    config: args.config,
    supportedTypes: args.supportedTypes,
  });

  const enabledTemplates = analysis.enabledTemplates;
  if (enabledTemplates.length === 0) {
    await writeResearchQueue(args.config, setResearchQueueIdleReason(queue, "no_enabled_candidates"));
    return { action: "idle", reason: "no_enabled_candidates" };
  }

  const supportedTemplates = analysis.supportedTemplates;
  if (supportedTemplates.length === 0) {
    await writeResearchQueue(args.config, setResearchQueueIdleReason(queue, "no_supported_candidates"));
    return { action: "idle", reason: "no_supported_candidates" };
  }

  const validProfileTemplates = analysis.validProfileTemplates;
  if (validProfileTemplates.length === 0) {
    await writeResearchQueue(args.config, setResearchQueueIdleReason(queue, "no_valid_validation_profile"));
    return { action: "idle", reason: "no_valid_validation_profile" };
  }

  const compatibleTemplates = analysis.compatibleTemplates;
  if (compatibleTemplates.length === 0) {
    await writeResearchQueue(
      args.config,
      setResearchQueueIdleReason(queue, "no_compatible_candidates_for_current_baseline"),
    );
    return { action: "idle", reason: "no_compatible_candidates_for_current_baseline" };
  }

  const campaignQualifiedTemplates = analysis.campaignQualifiedTemplates;
  if (campaignQualifiedTemplates.length === 0) {
    if (allowReserveRefill && (await replenishCandidateLibraryFromReserve(args.config)) > 0) {
      return autoEnqueueNextResearchTask({
        ...args,
        allowReserveRefill: false,
      });
    }
    await writeResearchQueue(
      args.config,
      setResearchQueueIdleReason(queue, "no_campaign_qualified_candidates"),
    );
    return { action: "idle", reason: "no_campaign_qualified_candidates" };
  }

  const dataQualityQualifiedTemplates = analysis.dataQualityQualifiedTemplates;
  if (dataQualityQualifiedTemplates.length === 0) {
    if (allowReserveRefill && (await replenishCandidateLibraryFromReserve(args.config)) > 0) {
      return autoEnqueueNextResearchTask({
        ...args,
        allowReserveRefill: false,
      });
    }
    await writeResearchQueue(
      args.config,
      setResearchQueueIdleReason(queue, "no_data_quality_qualified_candidates"),
    );
    return { action: "idle", reason: "no_data_quality_qualified_candidates" };
  }

  if (analysis.dedupedTemplates.length === 0) {
    if (allowReserveRefill && (await replenishCandidateLibraryFromReserve(args.config)) > 0) {
      return autoEnqueueNextResearchTask({
        ...args,
        allowReserveRefill: false,
      });
    }
    await writeResearchQueue(
      args.config,
      setResearchQueueIdleReason(queue, "all_candidates_deduped_for_current_baseline"),
    );
    return { action: "idle", reason: "all_candidates_deduped_for_current_baseline" };
  }

  const selected = analysis.selectableTemplates.sort((left, right) =>
    sortIndexedTemplates(left, right, analysis.memory),
  )[0];
  const enqueuedTask = createTaskFromTemplate({
    baselineId: analysis.baselineId,
    campaign: selected.campaign,
    family: selected.family,
    template: selected.template,
    runFingerprint: selected.runFingerprint,
    now: now(),
  });

  await writeResearchQueue(
    args.config,
    appendResearchTask(setResearchQueueIdleReason(queue, null), enqueuedTask),
  );

  return {
    action: "enqueued",
    taskId: enqueuedTask.id,
    runFingerprint: selected.runFingerprint,
  };
}

export function getSupportedPlannerTaskTypes(
  executors: ResearchTaskExecutorMap,
): Set<ResearchTaskType> {
  return new Set(
    Object.keys(executors).filter((key): key is ResearchTaskType =>
      typeof executors[key as ResearchTaskType] === "function",
    ),
  );
}
