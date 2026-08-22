import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const tsconfigPath = path.join(repoRoot, "tsconfig.json");

const investingOwnedRoots = [
  path.join("lib", "investing"),
  path.join("app", "api", "investing"),
  path.join("app", "app", "investing"),
  path.join("components", "investing"),
  path.join("scripts", "investing"),
];

const approvedNeutralInternalRootsOrFiles: string[] = [
  // intentionally empty in I0
];

const approvedInvestingConsumers: string[] = [
  // intentionally empty in I0
];

const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);

const rootLevelExcludedDirectoryNames = new Set([
  "artifacts",
  "docs",
  "tests",
  "coverage",
  "dist",
  "build",
  ".vercel",
  "playwright-report",
  "test-results",
]);

const dependencyGeneratedDirectoryNames = new Set([".git", "node_modules", ".turbo"]);

type ModuleReferenceKind =
  | "import"
  | "export"
  | "dynamic-import"
  | "require"
  | "module-require"
  | "import-equals"
  | "import-type"
  | "jsdoc-import"
  | "reference-path"
  | "reference-types"
  | "amd-dependency";

type ModuleReference =
  | {
      kind: ModuleReferenceKind;
      static: true;
      specifier: string;
    }
  | {
      kind: "dynamic-import" | "require" | "module-require";
      static: false;
    };

type SourceFileInput = {
  relativePath: string;
  source: string;
};

type ResolvedModuleClassification =
  | {
      kind: "INTERNAL_REPOSITORY_MODULE";
      relativePath: string;
    }
  | {
      kind: "EXTERNAL_LIBRARY_MODULE";
      resolvedFileName?: string;
    }
  | {
      kind: "EXCLUDED_REPOSITORY_MODULE";
      relativePath: string;
    }
  | {
      kind: "OUTSIDE_REPOSITORY_MODULE";
      resolvedFileName: string;
    }
  | {
      kind: "UNRESOLVED";
    };

type GraphViolation = {
  code:
    | "INVESTING_OUTBOUND_INTERNAL_DEPENDENCY_NOT_APPROVED"
    | "EXTERNAL_SOURCE_REACHES_INVESTING"
    | "NON_STATIC_MODULE_REFERENCE"
    | "UNRESOLVED_INTERNAL_MODULE_REFERENCE"
    | "EXCLUDED_REPOSITORY_MODULE_REFERENCE"
    | "OUTSIDE_REPOSITORY_MODULE_REFERENCE"
    | "SYMBOLIC_LINK_SOURCE_NOT_ALLOWED"
    | "GIT_SUBMODULE_SOURCE_NOT_ALLOWED";
  chain: string[];
  specifier?: string;
};

type SourceDiscoveryResult = {
  sourceFiles: string[];
  symbolicLinkViolations: GraphViolation[];
  gitLinkViolations: GraphViolation[];
  discoveryViolations: GraphViolation[];
};

type GitLinkEntry = {
  mode: "160000";
  path: string;
};

function normalizeSlashes(value: string) {
  return value.replaceAll("\\", "/");
}

function normalizeRelativePath(value: string) {
  return normalizeSlashes(path.normalize(value));
}

function absolutePath(relativePath: string) {
  return path.resolve(repoRoot, relativePath);
}

function relativePathFromAbsolute(absolute: string) {
  return normalizeRelativePath(path.relative(repoRoot, absolute));
}

function isInsideRepo(absolute: string) {
  const relative = path.relative(repoRoot, absolute);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function isInsideNodeModules(absolute: string) {
  return normalizeSlashes(path.resolve(absolute)).split("/").includes("node_modules");
}

function hasSourceExtension(filePath: string) {
  return sourceExtensions.has(path.extname(filePath).toLowerCase());
}

function isUnderRoot(relativePath: string, root: string) {
  const normalizedPath = normalizeRelativePath(relativePath);
  const normalizedRoot = normalizeRelativePath(root);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

function isInvestingOwned(relativePath: string) {
  return investingOwnedRoots.some((root) => isUnderRoot(relativePath, root));
}

function isApprovedNeutralInternal(relativePath: string) {
  return approvedNeutralInternalRootsOrFiles.some((entry) => isUnderRoot(relativePath, entry));
}

function isApprovedInvestingConsumer(relativePath: string) {
  return approvedInvestingConsumers.some((entry) => isUnderRoot(relativePath, entry));
}

function isProtectedSourcePath(relativePath: string) {
  return isInvestingOwned(relativePath) || isApprovedNeutralInternal(relativePath);
}

function isExcludedSourcePath(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath);
  const segments = normalized.split("/").filter(Boolean);

  if (normalized === "next-env.d.ts") return true;
  if (segments.length > 0 && rootLevelExcludedDirectoryNames.has(segments[0]!)) return true;
  if (segments.some((segment) => dependencyGeneratedDirectoryNames.has(segment) || segment.startsWith(".next"))) {
    return true;
  }
  if (isUnderRoot(normalized, path.join("supabase", "migrations"))) return true;

  return false;
}

function classifySymbolicLinkDiscovery(relativePath: string) {
  const normalizedPath = normalizeRelativePath(relativePath);
  const violation: GraphViolation | null = isProtectedSourcePath(normalizedPath)
    ? {
        code: "SYMBOLIC_LINK_SOURCE_NOT_ALLOWED",
        chain: [normalizedPath],
      }
    : null;

  return {
    follow: false,
    violation,
  };
}

function classifyGitLinkDiscovery(entry: GitLinkEntry) {
  const normalizedPath = normalizeRelativePath(entry.path);
  const violation: GraphViolation | null = isProtectedSourcePath(normalizedPath)
    ? {
        code: "GIT_SUBMODULE_SOURCE_NOT_ALLOWED",
        chain: [normalizedPath],
      }
    : null;

  return {
    trust: false,
    violation,
  };
}

function parseGitLinkEntriesFromLsFilesStage(output: string): GitLinkEntry[] {
  return output
    .split("\0")
    .filter(Boolean)
    .flatMap((entry): GitLinkEntry[] => {
      const match = /^(\d{6}) [0-9a-f]+ [0-3]\t(.+)$/u.exec(entry);
      if (!match || match[1] !== "160000") return [];
      return [{ mode: "160000", path: normalizeSlashes(match[2]!) }];
    });
}

function readGitLinkEntriesFromIndex(): GitLinkEntry[] {
  try {
    const output = execFileSync("git", ["ls-files", "--stage", "-z"], {
      cwd: repoRoot,
      encoding: "utf8",
      windowsHide: true,
    });
    return parseGitLinkEntriesFromLsFilesStage(output);
  } catch (error) {
    throw new Error(`Git index inspection failed closed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function collectProtectedGitLinkViolations() {
  return readGitLinkEntriesFromIndex()
    .map((entry) => classifyGitLinkDiscovery(entry).violation)
    .filter((violation): violation is GraphViolation => violation !== null);
}

function discoverSourceFiles(relativeRoot: string): SourceDiscoveryResult {
  const root = absolutePath(relativeRoot);
  if (!fs.existsSync(root)) {
    return {
      sourceFiles: [],
      symbolicLinkViolations: [],
      gitLinkViolations: [],
      discoveryViolations: [],
    };
  }

  const sourceFiles: string[] = [];
  const symbolicLinkViolations: GraphViolation[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const absoluteEntry = path.join(current, entry.name);
      const relativeEntry = relativePathFromAbsolute(absoluteEntry);
      if (entry.isSymbolicLink()) {
        const decision = classifySymbolicLinkDiscovery(relativeEntry);
        if (decision.violation) symbolicLinkViolations.push(decision.violation);
        if (!decision.follow) continue;
      }

      if (entry.isDirectory()) {
        if (isExcludedSourcePath(relativeEntry)) continue;
        stack.push(absoluteEntry);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!hasSourceExtension(entry.name)) continue;
      if (isExcludedSourcePath(relativeEntry)) continue;
      sourceFiles.push(relativeEntry);
    }
  }

  return {
    sourceFiles: sourceFiles.sort(),
    symbolicLinkViolations,
    gitLinkViolations: [],
    discoveryViolations: symbolicLinkViolations,
  };
}

function walkFiles(relativeRoot: string): string[] {
  return discoverSourceFiles(relativeRoot).sourceFiles;
}

function readTsconfigCompilerOptions() {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
  }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repoRoot);
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n")).join("\n"));
  }

  return parsed.options;
}

const compilerOptions = readTsconfigCompilerOptions();

function scriptKindFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".ts" || ext === ".mts" || ext === ".cts") return ts.ScriptKind.TS;
  if (ext === ".tsx") return ts.ScriptKind.TSX;
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return ts.ScriptKind.JS;
  if (ext === ".jsx") return ts.ScriptKind.JSX;
  return ts.ScriptKind.TS;
}

function collectLiteralReference(kind: ModuleReferenceKind, node: ts.Node | undefined, out: ModuleReference[]) {
  if (node && ts.isStringLiteralLike(node)) {
    out.push({ kind, static: true, specifier: normalizeSlashes(node.text) });
  }
}

function isRequireExpression(node: ts.Expression) {
  return ts.isIdentifier(node) && node.text === "require";
}

function isModuleRequireExpression(node: ts.Expression) {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "require" &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "module"
  );
}

function extractImportTypeSpecifier(node: ts.ImportTypeNode, out: ModuleReference[]) {
  const argument = node.argument;
  if (ts.isLiteralTypeNode(argument) && ts.isStringLiteralLike(argument.literal)) {
    out.push({ kind: "import-type", static: true, specifier: normalizeSlashes(argument.literal.text) });
  }
}

function extractModuleReferences(source: string, filePath: string) {
  const references: ModuleReference[] = [];
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKindFor(filePath));

  for (const reference of sourceFile.referencedFiles) {
    references.push({ kind: "reference-path", static: true, specifier: normalizeSlashes(reference.fileName) });
  }

  for (const reference of sourceFile.typeReferenceDirectives) {
    references.push({ kind: "reference-types", static: true, specifier: normalizeSlashes(reference.fileName) });
  }

  for (const dependency of sourceFile.amdDependencies) {
    references.push({ kind: "amd-dependency", static: true, specifier: normalizeSlashes(dependency.path) });
  }

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      collectLiteralReference("import", node.moduleSpecifier, references);
    }

    if (ts.isExportDeclaration(node)) {
      collectLiteralReference("export", node.moduleSpecifier, references);
    }

    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      collectLiteralReference("import-equals", node.moduleReference.expression, references);
    }

    if (ts.isImportTypeNode(node)) {
      extractImportTypeSpecifier(node, references);
    }

    if (ts.isJSDocImportTag(node)) {
      collectLiteralReference("jsdoc-import", node.moduleSpecifier, references);
    }

    if (ts.isCallExpression(node)) {
      const [firstArg] = node.arguments;

      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (firstArg && ts.isStringLiteralLike(firstArg)) {
          references.push({ kind: "dynamic-import", static: true, specifier: normalizeSlashes(firstArg.text) });
        } else {
          references.push({ kind: "dynamic-import", static: false });
        }
      }

      if (isRequireExpression(node.expression)) {
        if (firstArg && ts.isStringLiteralLike(firstArg)) {
          references.push({ kind: "require", static: true, specifier: normalizeSlashes(firstArg.text) });
        } else {
          references.push({ kind: "require", static: false });
        }
      }

      if (isModuleRequireExpression(node.expression)) {
        if (firstArg && ts.isStringLiteralLike(firstArg)) {
          references.push({ kind: "module-require", static: true, specifier: normalizeSlashes(firstArg.text) });
        } else {
          references.push({ kind: "module-require", static: false });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  function visitJsDoc(node: ts.Node) {
    for (const jsDoc of (node as { jsDoc?: readonly ts.JSDoc[] }).jsDoc ?? []) {
      visit(jsDoc);
    }

    ts.forEachChild(node, visitJsDoc);
  }

  visit(sourceFile);
  visitJsDoc(sourceFile);
  return references;
}

function collectRepositorySources() {
  return collectRepositorySourceDiscovery().sources;
}

function collectRepositorySourceDiscovery() {
  const discovery = discoverSourceFiles(".");
  const gitLinkViolations = collectProtectedGitLinkViolations();
  const sources: SourceFileInput[] = [];
  for (const file of discovery.sourceFiles) {
    sources.push({ relativePath: file, source: fs.readFileSync(absolutePath(file), "utf8") });
  }

  return {
    sources,
    symbolicLinkViolations: discovery.symbolicLinkViolations,
    gitLinkViolations,
    discoveryViolations: [...discovery.symbolicLinkViolations, ...gitLinkViolations],
  };
}

function createResolutionHost(virtualFiles: Map<string, string>) {
  const normalizeAbsolute = (filePath: string) => path.resolve(filePath);

  return {
    fileExists(filePath: string) {
      const absolute = normalizeAbsolute(filePath);
      return virtualFiles.has(absolute) || ts.sys.fileExists(absolute);
    },
    readFile(filePath: string) {
      const absolute = normalizeAbsolute(filePath);
      return virtualFiles.get(absolute) ?? ts.sys.readFile(absolute);
    },
    directoryExists(directoryPath: string) {
      const absolute = normalizeAbsolute(directoryPath);
      for (const filePath of virtualFiles.keys()) {
        if (filePath.startsWith(`${absolute}${path.sep}`)) return true;
      }
      return ts.sys.directoryExists ? ts.sys.directoryExists(absolute) : fs.existsSync(absolute);
    },
    getCurrentDirectory() {
      return repoRoot;
    },
    getDirectories(directoryPath: string) {
      return ts.sys.getDirectories ? ts.sys.getDirectories(directoryPath) : [];
    },
    realpath(filePath: string) {
      return ts.sys.realpath ? ts.sys.realpath(filePath) : filePath;
    },
    useCaseSensitiveFileNames() {
      return ts.sys.useCaseSensitiveFileNames;
    },
  } satisfies ts.ModuleResolutionHost;
}

function hasVirtualOrPhysicalSourceCandidate(absoluteWithoutExtension: string, virtualFiles: Map<string, string>) {
  const candidates = [
    absoluteWithoutExtension,
    ...Array.from(sourceExtensions, (extension) => `${absoluteWithoutExtension}${extension}`),
    ...Array.from(sourceExtensions, (extension) => path.join(absoluteWithoutExtension, `index${extension}`)),
  ];

  return candidates.some((candidate) => virtualFiles.has(path.resolve(candidate)) || fs.existsSync(candidate));
}

function isDefinitelyInternalSpecifier(fromFile: string, specifier: string, virtualFiles: Map<string, string>) {
  const specifierExtension = path.extname(specifier).toLowerCase();
  if (specifierExtension && !sourceExtensions.has(specifierExtension)) return false;

  if (specifier.startsWith("@/")) return true;

  if (specifier.startsWith(".")) {
    const candidate = path.resolve(path.dirname(absolutePath(fromFile)), specifier);
    return isInsideRepo(candidate);
  }

  const baseUrl = compilerOptions.baseUrl ? path.resolve(compilerOptions.baseUrl) : repoRoot;
  const candidate = path.resolve(baseUrl, specifier);
  return isInsideRepo(candidate) && hasVirtualOrPhysicalSourceCandidate(candidate, virtualFiles);
}

function classifyModuleReference(
  fromFile: string,
  specifier: string,
  resolutionHost: ts.ModuleResolutionHost,
): ResolvedModuleClassification {
  const resolved = ts.resolveModuleName(specifier, absolutePath(fromFile), compilerOptions, resolutionHost).resolvedModule;
  if (!resolved) return { kind: "UNRESOLVED" };

  const resolvedAbsolute = path.resolve(resolved.resolvedFileName);
  if (resolved.isExternalLibraryImport || isInsideNodeModules(resolvedAbsolute)) {
    return { kind: "EXTERNAL_LIBRARY_MODULE", resolvedFileName: resolvedAbsolute };
  }

  if (!isInsideRepo(resolvedAbsolute)) {
    return { kind: "OUTSIDE_REPOSITORY_MODULE", resolvedFileName: resolvedAbsolute };
  }

  const relativePath = relativePathFromAbsolute(resolvedAbsolute);
  if (isExcludedSourcePath(relativePath)) {
    return { kind: "EXCLUDED_REPOSITORY_MODULE", relativePath };
  }

  return { kind: "INTERNAL_REPOSITORY_MODULE", relativePath };
}

function classifyPathReference(
  fromFile: string,
  specifier: string,
  virtualFiles: Map<string, string>,
): ResolvedModuleClassification {
  const resolvedAbsolute = path.resolve(path.dirname(absolutePath(fromFile)), specifier);
  if (!virtualFiles.has(resolvedAbsolute) && !fs.existsSync(resolvedAbsolute)) return { kind: "UNRESOLVED" };
  if (isInsideNodeModules(resolvedAbsolute)) {
    return { kind: "EXTERNAL_LIBRARY_MODULE", resolvedFileName: resolvedAbsolute };
  }
  if (!isInsideRepo(resolvedAbsolute)) {
    return { kind: "OUTSIDE_REPOSITORY_MODULE", resolvedFileName: resolvedAbsolute };
  }

  const relativePath = relativePathFromAbsolute(resolvedAbsolute);
  if (isExcludedSourcePath(relativePath)) {
    return { kind: "EXCLUDED_REPOSITORY_MODULE", relativePath };
  }

  return { kind: "INTERNAL_REPOSITORY_MODULE", relativePath };
}

function classifyTypeReference(
  fromFile: string,
  specifier: string,
  resolutionHost: ts.ModuleResolutionHost,
): ResolvedModuleClassification {
  const resolved = ts.resolveTypeReferenceDirective(
    specifier,
    absolutePath(fromFile),
    compilerOptions,
    resolutionHost,
  ).resolvedTypeReferenceDirective;

  if (resolved) {
    const resolvedAbsolute = path.resolve(resolved.resolvedFileName);
    if (resolved.isExternalLibraryImport || isInsideNodeModules(resolvedAbsolute)) {
      return { kind: "EXTERNAL_LIBRARY_MODULE", resolvedFileName: resolvedAbsolute };
    }
    if (!isInsideRepo(resolvedAbsolute)) {
      return { kind: "OUTSIDE_REPOSITORY_MODULE", resolvedFileName: resolvedAbsolute };
    }

    const relativePath = relativePathFromAbsolute(resolvedAbsolute);
    if (isExcludedSourcePath(relativePath)) {
      return { kind: "EXCLUDED_REPOSITORY_MODULE", relativePath };
    }

    return { kind: "INTERNAL_REPOSITORY_MODULE", relativePath };
  }

  if (specifier.startsWith(".")) {
    return classifyModuleReference(fromFile, specifier, resolutionHost);
  }

  return { kind: "UNRESOLVED" };
}

function classifyStaticReference(
  fromFile: string,
  reference: Extract<ModuleReference, { static: true }>,
  resolutionHost: ts.ModuleResolutionHost,
  virtualFiles: Map<string, string>,
) {
  if (reference.kind === "reference-path") return classifyPathReference(fromFile, reference.specifier, virtualFiles);
  if (reference.kind === "reference-types") return classifyTypeReference(fromFile, reference.specifier, resolutionHost);
  return classifyModuleReference(fromFile, reference.specifier, resolutionHost);
}

function buildGraph(sources: SourceFileInput[], extraVirtualFiles = new Map<string, string>()) {
  const virtualFiles = new Map<string, string>();
  for (const source of sources) {
    virtualFiles.set(absolutePath(source.relativePath), source.source);
  }
  for (const [filePath, source] of extraVirtualFiles) {
    virtualFiles.set(path.resolve(filePath), source);
  }

  const resolutionHost = createResolutionHost(virtualFiles);
  const graph = new Map<string, string[]>();
  const violations: GraphViolation[] = [];

  for (const source of sources) {
    const relativePath = normalizeRelativePath(source.relativePath);
    const references = extractModuleReferences(source.source, relativePath);
    const ownsStaticBoundary = isInvestingOwned(relativePath) || isApprovedNeutralInternal(relativePath);
    const edges: string[] = [];

    for (const reference of references) {
      if (!reference.static) {
        if (ownsStaticBoundary) {
          violations.push({
            code: "NON_STATIC_MODULE_REFERENCE",
            chain: [relativePath],
          });
        }
        continue;
      }

      const resolved = classifyStaticReference(relativePath, reference, resolutionHost, virtualFiles);
      if (resolved.kind === "INTERNAL_REPOSITORY_MODULE") {
        edges.push(resolved.relativePath);
        continue;
      }

      if (resolved.kind === "EXTERNAL_LIBRARY_MODULE") {
        continue;
      }

      if (resolved.kind === "EXCLUDED_REPOSITORY_MODULE") {
        violations.push({
          code: "EXCLUDED_REPOSITORY_MODULE_REFERENCE",
          chain: [relativePath, resolved.relativePath],
          specifier: reference.specifier,
        });
        continue;
      }

      if (resolved.kind === "OUTSIDE_REPOSITORY_MODULE") {
        violations.push({
          code: "OUTSIDE_REPOSITORY_MODULE_REFERENCE",
          chain: [relativePath, normalizeSlashes(resolved.resolvedFileName)],
          specifier: reference.specifier,
        });
        continue;
      }

      if (isDefinitelyInternalSpecifier(relativePath, reference.specifier, virtualFiles)) {
        violations.push({
          code: "UNRESOLVED_INTERNAL_MODULE_REFERENCE",
          chain: [relativePath],
          specifier: reference.specifier,
        });
      }
    }

    graph.set(relativePath, Array.from(new Set(edges)).sort());
  }

  return { graph, violations };
}

function findReachableViolation(graph: Map<string, string[]>, start: string, shouldBlock: (node: string) => boolean) {
  const stack: Array<{ node: string; chain: string[] }> = [{ node: start, chain: [start] }];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current.node)) continue;
    visited.add(current.node);

    if (current.node !== start && shouldBlock(current.node)) {
      return current.chain;
    }

    for (const next of graph.get(current.node) ?? []) {
      stack.push({ node: next, chain: [...current.chain, next] });
    }
  }

  return null;
}

function analyzeArchitectureGraph(sources: SourceFileInput[], extraVirtualFiles = new Map<string, string>()) {
  const { graph, violations } = buildGraph(sources, extraVirtualFiles);

  for (const source of graph.keys()) {
    if (isInvestingOwned(source)) {
      const chain = findReachableViolation(
        graph,
        source,
        (node) => !isInvestingOwned(node) && !isApprovedNeutralInternal(node),
      );
      if (chain) {
        violations.push({
          code: "INVESTING_OUTBOUND_INTERNAL_DEPENDENCY_NOT_APPROVED",
          chain,
        });
      }
      continue;
    }

    if (!isApprovedInvestingConsumer(source)) {
      const chain = findReachableViolation(graph, source, isInvestingOwned);
      if (chain) {
        violations.push({
          code: "EXTERNAL_SOURCE_REACHES_INVESTING",
          chain,
        });
      }
    }
  }

  return violations;
}

function source(relativePath: string, contents: string): SourceFileInput {
  return { relativePath: normalizeRelativePath(relativePath), source: contents };
}

function expectViolation(
  sources: SourceFileInput[],
  code: GraphViolation["code"],
  chain: string[],
  extraVirtualFiles = new Map<string, string>(),
) {
  expect(analyzeArchitectureGraph(sources, extraVirtualFiles)).toContainEqual(
    expect.objectContaining({
      code,
      chain: chain.map(normalizeRelativePath),
    }),
  );
}

function classifySyntheticReference(sources: SourceFileInput[], fromFile: string, specifier: string) {
  const virtualFiles = new Map<string, string>();
  for (const source of sources) {
    virtualFiles.set(absolutePath(source.relativePath), source.source);
  }

  return classifyModuleReference(normalizeRelativePath(fromFile), specifier, createResolutionHost(virtualFiles));
}

describe("Investing Genesis architecture boundaries", () => {
  it("extracts all static module reference forms through the TypeScript AST", () => {
    const references = extractModuleReferences(
      `
        import value from "pkg-standard";
        import type { T } from "pkg-type";
        import "pkg-side-effect";
        export { value } from "pkg-export-named";
        export * from "pkg-export-star";
        async function load() {
          await import("pkg-dynamic");
          require("pkg-require");
          module.require("pkg-module-require");
        }
        import eq = require("pkg-import-equals");
        type Imported = import("pkg-import-type").Imported;
      `,
      "lib/investing/references.ts",
    );

    expect(references).toEqual([
      { kind: "import", static: true, specifier: "pkg-standard" },
      { kind: "import", static: true, specifier: "pkg-type" },
      { kind: "import", static: true, specifier: "pkg-side-effect" },
      { kind: "export", static: true, specifier: "pkg-export-named" },
      { kind: "export", static: true, specifier: "pkg-export-star" },
      { kind: "dynamic-import", static: true, specifier: "pkg-dynamic" },
      { kind: "require", static: true, specifier: "pkg-require" },
      { kind: "module-require", static: true, specifier: "pkg-module-require" },
      { kind: "import-equals", static: true, specifier: "pkg-import-equals" },
      { kind: "import-type", static: true, specifier: "pkg-import-type" },
    ]);
  });

  it("ignores commented forbidden imports and ordinary strings", () => {
    const references = extractModuleReferences(
      `
        // import x from "@/lib/trading/commented";
        const text = 'import x from "@/lib/trading/string"';
        import neutral from "react";
      `,
      "lib/investing/commented.ts",
    );

    expect(references).toEqual([{ kind: "import", static: true, specifier: "react" }]);
  });

  it("resolves alias, baseUrl, and relative module specifiers through tsconfig", () => {
    const aliasSources = [
      source("lib/investing/alias.ts", 'import x from "@/lib/trading/state";'),
      source("lib/trading/state.ts", "export const x = 1;"),
    ];
    const baseUrlSources = [
      source("lib/investing/base-url.ts", 'import x from "lib/trading/state";'),
      source("lib/trading/state.ts", "export const x = 1;"),
    ];
    const relativeSources = [
      source("lib/investing/relative.ts", 'import x from "../trading/state";'),
      source("lib/trading/state.ts", "export const x = 1;"),
    ];

    expect(classifySyntheticReference(aliasSources, "lib/investing/alias.ts", "@/lib/trading/state")).toEqual({
      kind: "INTERNAL_REPOSITORY_MODULE",
      relativePath: "lib/trading/state.ts",
    });
    expect(classifySyntheticReference(baseUrlSources, "lib/investing/base-url.ts", "lib/trading/state")).toEqual({
      kind: "INTERNAL_REPOSITORY_MODULE",
      relativePath: "lib/trading/state.ts",
    });
    expect(classifySyntheticReference(relativeSources, "lib/investing/relative.ts", "../trading/state")).toEqual({
      kind: "INTERNAL_REPOSITORY_MODULE",
      relativePath: "lib/trading/state.ts",
    });

    expectViolation(
      aliasSources,
      "INVESTING_OUTBOUND_INTERNAL_DEPENDENCY_NOT_APPROVED",
      ["lib/investing/alias.ts", "lib/trading/state.ts"],
    );

    expectViolation(
      baseUrlSources,
      "INVESTING_OUTBOUND_INTERNAL_DEPENDENCY_NOT_APPROVED",
      ["lib/investing/base-url.ts", "lib/trading/state.ts"],
    );

    expectViolation(
      relativeSources,
      "INVESTING_OUTBOUND_INTERNAL_DEPENDENCY_NOT_APPROVED",
      ["lib/investing/relative.ts", "lib/trading/state.ts"],
    );
  });

  it("includes .mts and .cts source files in the graph", () => {
    expectViolation(
      [
        source("lib/investing/module.mts", 'import x from "lib/trading/genesis-state-mts-target";'),
        source("lib/trading/genesis-state-mts-target.ts", "export const x = 1;"),
      ],
      "INVESTING_OUTBOUND_INTERNAL_DEPENDENCY_NOT_APPROVED",
      ["lib/investing/module.mts", "lib/trading/genesis-state-mts-target.ts"],
    );

    expectViolation(
      [
        source("lib/investing/module.cts", 'import x from "lib/trading/genesis-state-cts-target";'),
        source("lib/trading/genesis-state-cts-target.ts", "export const x = 1;"),
      ],
      "INVESTING_OUTBOUND_INTERNAL_DEPENDENCY_NOT_APPROVED",
      ["lib/investing/module.cts", "lib/trading/genesis-state-cts-target.ts"],
    );
  });

  it("allows installed external packages without internal graph edges or neutral allowlist entries", () => {
    const reactSources = [source("lib/investing/react.tsx", 'import React from "react"; export const x = React;')];
    const reactResolution = classifySyntheticReference(reactSources, "lib/investing/react.tsx", "react");

    expect(reactResolution.kind).toBe("EXTERNAL_LIBRARY_MODULE");
    expect(analyzeArchitectureGraph(reactSources)).toEqual([]);

    const clerkSources = [
      source("lib/investing/clerk.ts", 'import { auth } from "@clerk/nextjs/server"; export const x = auth;'),
    ];
    const clerkResolution = classifySyntheticReference(clerkSources, "lib/investing/clerk.ts", "@clerk/nextjs/server");

    expect(clerkResolution.kind).toBe("EXTERNAL_LIBRARY_MODULE");
    expect(analyzeArchitectureGraph(clerkSources)).toEqual([]);
  });

  it("allows Investing to depend on Investing", () => {
    const violations = analyzeArchitectureGraph([
      source("lib/investing/service.ts", 'import x from "lib/investing/account";'),
      source("lib/investing/account.ts", "export const x = 1;"),
    ]);

    expect(violations).toEqual([]);
  });

  it("blocks Investing to Trading direct and transitive graph paths", () => {
    expectViolation(
      [
        source("lib/investing/service.ts", 'import x from "lib/trading/state";'),
        source("lib/trading/state.ts", "export const x = 1;"),
      ],
      "INVESTING_OUTBOUND_INTERNAL_DEPENDENCY_NOT_APPROVED",
      ["lib/investing/service.ts", "lib/trading/state.ts"],
    );

    expectViolation(
      [
        source("lib/investing/service.ts", 'import bridge from "lib/shared/bridge";'),
        source("lib/shared/bridge.ts", 'import state from "lib/trading/state";'),
        source("lib/trading/state.ts", "export const state = 1;"),
      ],
      "INVESTING_OUTBOUND_INTERNAL_DEPENDENCY_NOT_APPROVED",
      ["lib/investing/service.ts", "lib/shared/bridge.ts"],
    );
  });

  it("blocks Trading to Investing direct and transitive graph paths", () => {
    expectViolation(
      [
        source("lib/trading/foo.ts", 'import account from "lib/investing/account";'),
        source("lib/investing/account.ts", "export const account = 1;"),
      ],
      "EXTERNAL_SOURCE_REACHES_INVESTING",
      ["lib/trading/foo.ts", "lib/investing/account.ts"],
    );

    expectViolation(
      [
        source("lib/trading/foo.ts", 'import bridge from "lib/shared/bridge";'),
        source("lib/shared/bridge.ts", 'import account from "lib/investing/account";'),
        source("lib/investing/account.ts", "export const account = 1;"),
      ],
      "EXTERNAL_SOURCE_REACHES_INVESTING",
      ["lib/trading/foo.ts", "lib/shared/bridge.ts", "lib/investing/account.ts"],
    );
  });

  it("blocks root-level source files from reaching Investing directly or through a bridge", () => {
    expectViolation(
      [
        source("root-consumer.ts", 'import account from "lib/investing/account";'),
        source("lib/investing/account.ts", "export const account = 1;"),
      ],
      "EXTERNAL_SOURCE_REACHES_INVESTING",
      ["root-consumer.ts", "lib/investing/account.ts"],
    );

    expectViolation(
      [
        source("root-consumer.ts", 'import bridge from "lib/shared/bridge";'),
        source("lib/shared/bridge.ts", 'import account from "lib/investing/account";'),
        source("lib/investing/account.ts", "export const account = 1;"),
      ],
      "EXTERNAL_SOURCE_REACHES_INVESTING",
      ["root-consumer.ts", "lib/shared/bridge.ts", "lib/investing/account.ts"],
    );
  });

  it("blocks Investing to arbitrary internal shared files because I0 neutral allowlist is empty", () => {
    expectViolation(
      [
        source("lib/investing/service.ts", 'import helper from "lib/shared/helper";'),
        source("lib/shared/helper.ts", "export const helper = 1;"),
      ],
      "INVESTING_OUTBOUND_INTERNAL_DEPENDENCY_NOT_APPROVED",
      ["lib/investing/service.ts", "lib/shared/helper.ts"],
    );
  });

  it("keeps Investing-owned nested tests, build, and docs directories inside the canonical graph", () => {
    expect(isExcludedSourcePath("tests/foo.ts")).toBe(true);
    expect(isExcludedSourcePath("build/foo.ts")).toBe(true);
    expect(isExcludedSourcePath("docs/foo.ts")).toBe(true);
    expect(isExcludedSourcePath("artifacts/site-backups/foo.ts")).toBe(true);
    expect(isExcludedSourcePath("coverage/foo.ts")).toBe(true);
    expect(isExcludedSourcePath("dist/foo.ts")).toBe(true);
    expect(isExcludedSourcePath("playwright-report/foo.ts")).toBe(true);
    expect(isExcludedSourcePath("test-results/foo.ts")).toBe(true);
    expect(isExcludedSourcePath("supabase/migrations/20260101000000_example.sql")).toBe(true);
    expect(isExcludedSourcePath("next-env.d.ts")).toBe(true);
    expect(isExcludedSourcePath("lib/investing/tests/foo.ts")).toBe(false);
    expect(isExcludedSourcePath("lib/investing/build/foo.ts")).toBe(false);
    expect(isExcludedSourcePath("components/investing/docs/foo.tsx")).toBe(false);
  });

  it("fails closed on symbolic links inside protected Investing source roots without following them", () => {
    expect(classifySymbolicLinkDiscovery("lib/investing/link.ts")).toEqual({
      follow: false,
      violation: {
        code: "SYMBOLIC_LINK_SOURCE_NOT_ALLOWED",
        chain: ["lib/investing/link.ts"],
      },
    });

    expect(classifySymbolicLinkDiscovery("app/api/investing/link/route.ts")).toEqual({
      follow: false,
      violation: {
        code: "SYMBOLIC_LINK_SOURCE_NOT_ALLOWED",
        chain: ["app/api/investing/link/route.ts"],
      },
    });

    expect(classifySymbolicLinkDiscovery("lib/trading/unrelated-link.ts")).toEqual({
      follow: false,
      violation: null,
    });
  });

  it("fails closed on Git submodule gitlinks inside protected Investing source roots", () => {
    expect(classifyGitLinkDiscovery({ mode: "160000", path: "lib/investing/vendor-engine" })).toEqual({
      trust: false,
      violation: {
        code: "GIT_SUBMODULE_SOURCE_NOT_ALLOWED",
        chain: ["lib/investing/vendor-engine"],
      },
    });

    expect(classifyGitLinkDiscovery({ mode: "160000", path: "app/api/investing/vendor" })).toEqual({
      trust: false,
      violation: {
        code: "GIT_SUBMODULE_SOURCE_NOT_ALLOWED",
        chain: ["app/api/investing/vendor"],
      },
    });

    expect(classifyGitLinkDiscovery({ mode: "160000", path: "lib/trading/vendor-engine" })).toEqual({
      trust: false,
      violation: null,
    });
  });

  it("blocks forbidden dependencies hidden under Investing-owned build directories", () => {
    expectViolation(
      [
        source("lib/investing/build/hidden.ts", 'import state from "lib/trading/state";'),
        source("lib/trading/state.ts", "export const state = 1;"),
      ],
      "INVESTING_OUTBOUND_INTERNAL_DEPENDENCY_NOT_APPROVED",
      ["lib/investing/build/hidden.ts", "lib/trading/state.ts"],
    );
  });

  it("blocks Investing from depending on excluded repository source or excluded bridge files", () => {
    expectViolation(
      [source("lib/investing/use-test-helper.ts", 'import helper from "tests/helper";')],
      "EXCLUDED_REPOSITORY_MODULE_REFERENCE",
      ["lib/investing/use-test-helper.ts", "tests/helper.ts"],
      new Map([[absolutePath("tests/helper.ts"), "export default 1;"]]),
    );

    expectViolation(
      [source("lib/investing/use-artifact.ts", 'import helper from "artifacts/site-backups/helper";')],
      "EXCLUDED_REPOSITORY_MODULE_REFERENCE",
      ["lib/investing/use-artifact.ts", "artifacts/site-backups/helper.ts"],
      new Map([[absolutePath("artifacts/site-backups/helper.ts"), "export default 1;"]]),
    );

    expectViolation(
      [source("lib/investing/use-bridge.ts", 'import bridge from "artifacts/site-backups/bridge";')],
      "EXCLUDED_REPOSITORY_MODULE_REFERENCE",
      ["lib/investing/use-bridge.ts", "artifacts/site-backups/bridge.ts"],
      new Map([
        [absolutePath("artifacts/site-backups/bridge.ts"), 'import state from "lib/trading/state"; export default state;'],
        [absolutePath("lib/trading/state.ts"), "export const state = 1;"],
      ]),
    );
  });

  it("blocks resolved non-library dependencies outside the repository", () => {
    const outsideFile = path.resolve(repoRoot, "..", "outside-types.d.ts");
    const violations = analyzeArchitectureGraph(
      [source("lib/investing/outside.ts", '/// <reference path="../../../outside-types.d.ts" />')],
      new Map([[outsideFile, "export type Outside = string;"]]),
    );

    expect(violations).toContainEqual({
      code: "OUTSIDE_REPOSITORY_MODULE_REFERENCE",
      chain: ["lib/investing/outside.ts", normalizeSlashes(outsideFile)],
      specifier: "../../../outside-types.d.ts",
    });
  });

  it("blocks TypeScript reference path and reference types across Investing and Trading", () => {
    expectViolation(
      [
        source("lib/investing/ref-path.ts", '/// <reference path="../trading/types.d.ts" />'),
        source("lib/trading/types.d.ts", "export type TradingType = string;"),
      ],
      "INVESTING_OUTBOUND_INTERNAL_DEPENDENCY_NOT_APPROVED",
      ["lib/investing/ref-path.ts", "lib/trading/types.d.ts"],
    );

    expectViolation(
      [
        source("lib/investing/ref-types.ts", '/// <reference types="../trading/types" />'),
        source("lib/trading/types.d.ts", "export type TradingType = string;"),
      ],
      "INVESTING_OUTBOUND_INTERNAL_DEPENDENCY_NOT_APPROVED",
      ["lib/investing/ref-types.ts", "lib/trading/types.d.ts"],
    );

    expectViolation(
      [
        source("lib/trading/ref-path.ts", '/// <reference path="../investing/types.d.ts" />'),
        source("lib/investing/types.d.ts", "export type InvestingType = string;"),
      ],
      "EXTERNAL_SOURCE_REACHES_INVESTING",
      ["lib/trading/ref-path.ts", "lib/investing/types.d.ts"],
    );

    expectViolation(
      [
        source("lib/trading/ref-types.ts", '/// <reference types="../investing/types" />'),
        source("lib/investing/types.d.ts", "export type InvestingType = string;"),
      ],
      "EXTERNAL_SOURCE_REACHES_INVESTING",
      ["lib/trading/ref-types.ts", "lib/investing/types.d.ts"],
    );
  });

  it("blocks JSDoc import and typedef import dependencies across Investing and Trading", () => {
    expectViolation(
      [
        source("lib/investing/jsdoc-import.js", '/** @import { Foo } from "../trading/types" */\nconst x = 1;'),
        source("lib/trading/types.ts", "export type Foo = string;"),
      ],
      "INVESTING_OUTBOUND_INTERNAL_DEPENDENCY_NOT_APPROVED",
      ["lib/investing/jsdoc-import.js", "lib/trading/types.ts"],
    );

    expectViolation(
      [
        source(
          "lib/investing/jsdoc-typedef.js",
          '/** @typedef {import("../trading/types").Foo} Foo */\nconst x = 1;',
        ),
        source("lib/trading/types.ts", "export type Foo = string;"),
      ],
      "INVESTING_OUTBOUND_INTERNAL_DEPENDENCY_NOT_APPROVED",
      ["lib/investing/jsdoc-typedef.js", "lib/trading/types.ts"],
    );
  });

  it("parses JSX, .mjs, and .cjs source while detecting forbidden dependencies", () => {
    expectViolation(
      [
        source(
          "components/investing/Widget.jsx",
          'import state from "lib/trading/state"; export default function Widget() { return <div>{state}</div>; }',
        ),
        source("lib/trading/state.ts", "export const state = 1;"),
      ],
      "INVESTING_OUTBOUND_INTERNAL_DEPENDENCY_NOT_APPROVED",
      ["components/investing/Widget.jsx", "lib/trading/state.ts"],
    );

    expectViolation(
      [
        source("lib/investing/module.mjs", 'import state from "lib/trading/mjs-state"; export const x = state;'),
        source("lib/trading/mjs-state.ts", "export const state = 1;"),
      ],
      "INVESTING_OUTBOUND_INTERNAL_DEPENDENCY_NOT_APPROVED",
      ["lib/investing/module.mjs", "lib/trading/mjs-state.ts"],
    );

    expectViolation(
      [
        source("lib/investing/module.cjs", 'const state = require("lib/trading/cjs-state"); module.exports = state;'),
        source("lib/trading/cjs-state.ts", "export const state = 1;"),
      ],
      "INVESTING_OUTBOUND_INTERNAL_DEPENDENCY_NOT_APPROVED",
      ["lib/investing/module.cjs", "lib/trading/cjs-state.ts"],
    );
  });

  it("blocks non-static module references inside Investing-owned files", () => {
    const violations = analyzeArchitectureGraph([
      source(
        "lib/investing/dynamic.ts",
        `
          const target = "lib/trading/state";
          async function load() {
            await import(target);
            require(target);
            module.require(target);
          }
        `,
      ),
    ]);

    expect(violations).toEqual([
      { code: "NON_STATIC_MODULE_REFERENCE", chain: ["lib/investing/dynamic.ts"] },
      { code: "NON_STATIC_MODULE_REFERENCE", chain: ["lib/investing/dynamic.ts"] },
      { code: "NON_STATIC_MODULE_REFERENCE", chain: ["lib/investing/dynamic.ts"] },
    ]);
  });

  it("treats an absent source root as an empty boundary, not as a failure", () => {
    const missingRoot = path.join("__missing__", "investing");

    expect(walkFiles(missingRoot)).toEqual([]);
    expect(analyzeArchitectureGraph([])).toEqual([]);
  });

  it("discovers source across the whole repository including root-level files", () => {
    const sources = collectRepositorySources().map((entry) => entry.relativePath);

    expect(sources).toContain("proxy.ts");
    expect(sources).toContain("next.config.ts");
    expect(sources.some((entry) => entry.startsWith("tests/"))).toBe(false);
    expect(sources.some((entry) => entry.startsWith("docs/"))).toBe(false);
    expect(sources.some((entry) => entry.startsWith("supabase/migrations/"))).toBe(false);
  });

  it("documents the Genesis architecture anchors", () => {
    const constitution = fs.readFileSync(
      path.join(repoRoot, "docs", "investing-genesis", "I0_CONSTITUTION.md"),
      "utf8",
    );

    expect(constitution).toContain("GENESIS_BASELINE_SHA =\n87c19fd5ebadcc5b20ce587c185346379fd8d96b");
    expect(constitution).toContain("Investing and Trading are independent domains");
    expect(constitution).toContain("INTERNAL DEPENDENCY POLICY = DENY BY DEFAULT");
    expect(constitution).toContain("APPROVED_NEUTRAL_INTERNAL_IMPORTS = EMPTY");
    expect(constitution).toContain("Architecture isolation applies transitively");
    expect(constitution).toContain("New Investing MUST use its own dedicated namespace/schema");
    expect(constitution).toContain("MUST NOT use filesystem symbolic links or Git submodules");
    expect(constitution).toContain("A symlink or submodule encountered inside an Investing-owned source namespace must FAIL CLOSED");
    expect(constitution).toContain("The Git index gitlink entry, not `.gitmodules` alone");
    expect(constitution).toContain("AuthorizedInvestingContext is server-internal authority");
    expect(constitution).toContain("END_TO_END_USER_TRACEABILITY = REQUIRED");
    expect(constitution).toContain("A SYSTEM_ACTOR does not require or fabricate a USER_PRINCIPAL");
    expect(constitution).toContain("ACCOUNT_SCOPE");
    expect(constitution).toContain("TENANT_SCOPE");
    expect(constitution).toContain("DOMAIN_SCOPE");
    expect(constitution).toContain("VALUE_ORIGIN");
    expect(constitution).toContain("FRESHNESS");
    expect(constitution).toContain("CONTEXT");
    expect(constitution).toContain("STALE != FRESH");
    expect(constitution).toContain("DEMO != PRODUCTION context");
    expect(constitution).toContain("I5 Investing Research Lab");
    expect(constitution).toContain("Monte Carlo");
    expect(constitution).toContain("I12 Core Investing Readiness Gate");
    expect(constitution).toContain("Product dashboard scope is intentionally deferred");
  });

  it("has zero current repository graph violations before Genesis implementation exists", () => {
    const discovery = collectRepositorySourceDiscovery();
    const violations = analyzeArchitectureGraph(discovery.sources);

    expect(violations).toEqual([]);
    expect(discovery.symbolicLinkViolations).toEqual([]);
    expect(discovery.gitLinkViolations).toEqual([]);
    expect(discovery.discoveryViolations).toEqual([]);
  }, 30000);
});
