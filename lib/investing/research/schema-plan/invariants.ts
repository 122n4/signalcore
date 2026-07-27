import type {
  RuntimeValidationResult,
  ValidationIssue,
} from "../contracts/primitives";
import type { PlannedResearchTable } from "./blueprint";
import {
  INVESTING_RESEARCH_SCHEMA_BLUEPRINT,
} from "./blueprint";
import { RESEARCH_SCHEMA_BLUEPRINT_VERSION } from "../reproducibility/versions";

const REQUIRED_SCOPE = [
  "tenant_id",
  "owner_id",
  "portfolio_id",
  "account_id",
] as const;

export function validateResearchSchemaBlueprint(
  value: unknown = INVESTING_RESEARCH_SCHEMA_BLUEPRINT,
): RuntimeValidationResult<typeof INVESTING_RESEARCH_SCHEMA_BLUEPRINT> {
  const issues: ValidationIssue[] = [];
  if (
    typeof value !== "object"
    || value === null
    || !("contractVersion" in value)
    || !("tables" in value)
    || !Array.isArray(value.tables)
  ) {
    return {
      ok: false,
      issues: [{ path: "schemaPlan", reasonCode: "research.contract.invalid" }],
    };
  }
  const blueprint = value as unknown as typeof INVESTING_RESEARCH_SCHEMA_BLUEPRINT;
  if (blueprint.contractVersion !== RESEARCH_SCHEMA_BLUEPRINT_VERSION) {
    issues.push({
      path: "schemaPlan.contractVersion",
      reasonCode: "research.contract.version_missing",
    });
  }
  const names = new Set<string>();
  const tables = blueprint.tables as readonly PlannedResearchTable[];
  for (let index = 0; index < tables.length; index += 1) {
    const table = tables[index];
    const path = `schemaPlan.tables[${index}]`;
    if (
      !table.name.startsWith("investing_research_")
      || table.name.startsWith("research_lab_")
      || table.name === "investing_research_snapshots"
      || /trading/iu.test(table.name)
    ) issues.push({ path: `${path}.name`, reasonCode: "research.contract.invalid" });
    if (names.has(table.name)) {
      issues.push({
        path: `${path}.name`,
        reasonCode: "research.integrity.duplicate_value",
      });
    }
    names.add(table.name);
    if (table.scopeBound) {
      if (
        table.scopeColumns.length !== REQUIRED_SCOPE.length
        || REQUIRED_SCOPE.some((column) => !table.scopeColumns.includes(column))
        || REQUIRED_SCOPE.some((column) => !table.explicitColumns.includes(column))
        || table.globalJustification !== null
      ) {
        issues.push({
          path: `${path}.scopeColumns`,
          reasonCode: "research.identity.scope_incomplete",
        });
      }
    } else if (
      table.scopeColumns.length !== 0
      || table.globalJustification === null
      || table.globalJustification.trim() === ""
    ) {
      issues.push({
        path: `${path}.globalJustification`,
        reasonCode: "research.identity.scope_mismatch",
      });
    }
    if (
      table.rlsPosture.payloadScopeTrusted
      || table.rlsPosture.serviceRoleIsAuthorizationBoundary
      || table.rlsPosture.authenticatedWrite !== "none"
    ) issues.push({ path: `${path}.rlsPosture`, reasonCode: "research.identity.scope_mismatch" });
    if (
      table.primaryKey.length === 0
      || table.uniqueConstraints.length === 0
      || table.implementationPhase === ""
      || table.rollbackPosture === undefined
    ) issues.push({ path, reasonCode: "research.contract.invalid" });
    if (
      table.explicitColumns.some((column) =>
        /^(orders?|positions?|accounting|broker)$/iu.test(column))
    ) issues.push({ path: `${path}.explicitColumns`, reasonCode: "research.contract.invalid" });
    for (let foreignKeyIndex = 0; foreignKeyIndex < table.foreignKeys.length; foreignKeyIndex += 1) {
      const foreignKey = table.foreignKeys[foreignKeyIndex];
      const foreignKeyPath = `${path}.foreignKeys[${foreignKeyIndex}]`;
      const parent = tables.find(
        (candidate) => candidate.name === foreignKey.referencesTable,
      );
      if (parent === undefined) {
        issues.push({
          path: `${foreignKeyPath}.referencesTable`,
          reasonCode: "research.integrity.reference_mismatch",
        });
        continue;
      }
      if (foreignKey.scopeRelation === "same_scope") {
        if (
          !table.scopeBound
          || !parent.scopeBound
          || REQUIRED_SCOPE.some((column) =>
            !foreignKey.columns.includes(column))
          || REQUIRED_SCOPE.some((column) =>
            !foreignKey.referencesColumns.includes(column))
        ) {
          issues.push({
            path: foreignKeyPath,
            reasonCode: "research.identity.scope_mismatch",
          });
          continue;
        }
        const hasParentKey = parent.uniqueConstraints.some(
          (constraint) =>
            constraint.length === foreignKey.referencesColumns.length
            && constraint.every(
              (column, columnIndex) =>
                column === foreignKey.referencesColumns[columnIndex],
            ),
        );
        if (!hasParentKey) {
          issues.push({
            path: `${foreignKeyPath}.referencesColumns`,
            reasonCode: "research.integrity.reference_mismatch",
          });
        }
      } else if (
        foreignKey.scopeRelation !== "global"
        || table.scopeBound
        || parent.scopeBound
        || foreignKey.globalJustification === null
        || foreignKey.globalJustification.trim() === ""
      ) {
        issues.push({
          path: foreignKeyPath,
          reasonCode: "research.identity.scope_mismatch",
        });
      }
    }
  }
  return issues.length === 0
    ? { ok: true, value: blueprint }
    : { ok: false, issues };
}
