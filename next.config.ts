import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * A Content Security Policy limits what a script injected into a page could
 * do. Combined with the httpOnly key cookie, an XSS bug can neither read the
 * OpenAI key nor ship data to an attacker's server.
 *
 * `unsafe-inline` on scripts is what Next's bootstrap needs without a nonce;
 * `unsafe-eval` is only tolerated in development, where React Fast Refresh
 * requires it.
 */
const csp = [
  "default-src 'self'",
  // 'wasm-unsafe-eval' lets the browser compile the MobileCLIP2 WebAssembly
  // backend. It permits compiling WASM and nothing else — it does not restore
  // eval() for JavaScript.
  //
  // blob: is what ONNX Runtime needs: it assembles its backend at runtime and
  // loads it with a dynamic import() of a blob URL it just created. Without it
  // the only symptom is "no available backend found". The blobs come from
  // scripts already allowed by 'self', so this does not widen what code may
  // reach the page — only how it is loaded.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:${isDev ? " 'unsafe-eval'" : ""}`,
  // The same backend also starts its threads as blob: workers.
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  // Signed storage links and the local object URL used for the upload preview.
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  // Supabase auth, database and storage. OpenAI is called from the server only.
  // Open-Meteo is called straight from the browser so each visitor spends
  // their own rate-limit quota rather than the server's shared egress IP.
  //
  // Hugging Face serves the MobileCLIP2-S0 weights (it redirects to cdn-lfs
  // hosts under hf.co), and jsDelivr serves the ONNX Runtime WebAssembly that
  // executes them — Transformers.js fetches the runtime from there by default,
  // pinned to the onnxruntime-web version in package-lock. Narrowed to the npm
  // mirror path rather than the whole CDN, and it is connect-src only: these
  // are fetched as data, not executed as page scripts.
  //
  // Only the model is fetched. The garment photo is analysed on the device and
  // is never uploaded anywhere but the user's own Supabase storage.
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.open-meteo.com https://huggingface.co https://*.hf.co https://cdn.jsdelivr.net/npm/${isDev ? " ws://localhost:*" : ""}`,
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.12.217"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // Geolocation is used by the outfits page; the rest stays off.
            value: "camera=(self), geolocation=(self), microphone=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
