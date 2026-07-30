/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require("node:module");
const path = require("node:path");

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (
    request === "server-only"
    && process.env.INVESTING_QA_SERVER_ONLY_STUB === "true"
  ) {
    return path.join(process.cwd(), "tests/fixtures/serverOnly.cjs");
  }

  if (typeof request === "string" && request.startsWith("@/")) {
    const mapped = path.join(process.cwd(), request.slice(2));
    return originalResolveFilename.call(this, mapped, parent, isMain, options);
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};
