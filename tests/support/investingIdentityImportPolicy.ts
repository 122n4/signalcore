import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const DATASET_COMPOSITION_PUBLIC_IDENTITY_ENTRYPOINT =
  "@/lib/investing/identity/server";

export function datasetCompositionConsumerPath(root: string): string {
  return path.resolve(
    root,
    "lib",
    "investing",
    "research",
    "dataset-catalog",
    "composition.server.ts",
  );
}

function inspectModuleLoads(source: string): Readonly<{
  specifiers: readonly string[];
  hasUninspectableDynamicLoad: boolean;
}> {
  const sourceFile = ts.createSourceFile(
    "identity-consumer.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];
  let hasUninspectableDynamicLoad = false;

  function add(node: ts.Expression | undefined) {
    if (node && ts.isStringLiteralLike(node)) specifiers.push(node.text);
  }

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node.moduleReference.expression);
    } else if (ts.isCallExpression(node)) {
      const dynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const commonJsRequire = ts.isIdentifier(node.expression)
        && node.expression.text === "require";
      if (dynamicImport || commonJsRequire) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteralLike(argument)) {
          specifiers.push(argument.text);
        } else {
          hasUninspectableDynamicLoad = true;
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { specifiers, hasUninspectableDynamicLoad };
}

function targetsIdentityBoundary(
  root: string,
  consumerPath: string,
  specifier: string,
): boolean {
  const aliasRoot = "@/lib/investing/identity";
  const normalizedSpecifier = specifier.replaceAll("\\", "/");
  if (
    normalizedSpecifier === aliasRoot
    || normalizedSpecifier.startsWith(`${aliasRoot}/`)
  ) {
    return true;
  }

  const identityRoot = path.resolve(root, "lib", "investing", "identity");
  let resolved: string;
  if (specifier.startsWith("file:")) {
    try {
      resolved = path.resolve(fileURLToPath(specifier));
    } catch {
      return true;
    }
  } else {
    if (
      !normalizedSpecifier.startsWith(".")
      && !path.isAbsolute(normalizedSpecifier)
    ) {
      return false;
    }
    resolved = path.resolve(
      path.dirname(consumerPath),
      normalizedSpecifier,
    );
  }
  const comparableRoot = process.platform === "win32"
    ? identityRoot.toLowerCase()
    : identityRoot;
  const comparableResolved = process.platform === "win32"
    ? resolved.toLowerCase()
    : resolved;
  return comparableResolved === comparableRoot
    || comparableResolved.startsWith(`${comparableRoot}${path.sep}`);
}

export function datasetCompositionIdentityImportsAccepted(input: Readonly<{
  root: string;
  consumerPath: string;
  source: string;
}>): boolean {
  const consumerPath = path.resolve(input.consumerPath);
  if (consumerPath !== datasetCompositionConsumerPath(input.root)) return false;

  const inspection = inspectModuleLoads(input.source);
  if (inspection.hasUninspectableDynamicLoad) return false;
  const identityImports = inspection.specifiers.filter((specifier) =>
    targetsIdentityBoundary(input.root, consumerPath, specifier));
  return identityImports.length > 0
    && identityImports.every((specifier) =>
      specifier === DATASET_COMPOSITION_PUBLIC_IDENTITY_ENTRYPOINT);
}
