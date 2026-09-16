/**
 * Lets the dev scripts in this folder import application source directly:
 * resolves the `@/` alias from tsconfig, and fills in the `.ts` extension that
 * Node's ESM resolver requires but the app's own imports omit.
 *
 * Only for `node --experimental-strip-types` scripts. Next handles both of
 * these itself, so nothing in src/ needs to know this exists.
 */
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolvePath(dirname(fileURLToPath(import.meta.url)), "../src");

function withExtension(path) {
  if (existsSync(path)) return path;
  for (const ext of [".ts", ".tsx", "/index.ts"]) {
    if (existsSync(path + ext)) return path + ext;
  }
  return path;
}

export function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    return next(pathToFileURL(withExtension(`${SRC}/${specifier.slice(2)}`)).href, context);
  }
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const target = new URL(specifier, context.parentURL);
    if (target.protocol === "file:") {
      return next(pathToFileURL(withExtension(decodeURIComponent(target.pathname))).href, context);
    }
  }
  return next(specifier, context);
}
