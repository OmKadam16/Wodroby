/**
 * Copies the ONNX Runtime Web WASM binaries into public/ort/.
 *
 * They are served from our own origin rather than a CDN so the Content
 * Security Policy in next.config.ts does not have to allow a third-party
 * script host. They are generated, not authored, so public/ort/ is gitignored
 * and this script runs before every build.
 */
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "onnxruntime-web", "dist");
const to = join(root, "public", "ort");

// Every variant of the threaded SIMD build. ONNX Runtime picks one at
// runtime based on what the browser supports — WebGPU uses the `jspi` build
// where JS Promise Integration exists and falls back to `asyncify` otherwise —
// and it fetches the .mjs lazily, so shipping only one variant fails at
// session-creation time with "no available backend found".
const NEEDED = /^ort-wasm-simd-threaded(\.[a-z]+)?\.(wasm|mjs)$/;

await mkdir(to, { recursive: true });
const files = (await readdir(from)).filter((f) => NEEDED.test(f));

if (files.length === 0) {
  console.error("copy-ort-assets: no matching files in", from);
  process.exit(1);
}

for (const file of files) {
  await copyFile(join(from, file), join(to, file));
  console.log("copy-ort-assets:", file);
}
