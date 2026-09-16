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
  // 'wasm-unsafe-eval' lets the browser compile the ONNX Runtime WASM
  // module. It permits WebAssembly only — not eval() of JavaScript.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Signed storage links and the local object URL used for the upload preview.
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  // Supabase auth, database and storage. OpenAI is called from the server only.
  // Open-Meteo is called straight from the browser so each visitor spends
  // their own rate-limit quota rather than the server's shared egress IP.
  // huggingface.co serves the BiRefNet weights and redirects to its
  // *.hf.co CDN; the model is fetched once and cached locally.
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.open-meteo.com https://huggingface.co https://*.hf.co${isDev ? " ws://localhost:*" : ""}`,
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
