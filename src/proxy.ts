import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const isDev = process.env.NODE_ENV === "development";

/**
 * A Content Security Policy limits what a script injected into a page could
 * do. `connect-src` is the part that matters most here: even with script
 * execution, there is nowhere to send a wardrobe to — the allowed origins are
 * Supabase, the weather API and the two hosts that serve the model.
 *
 * Inline scripts need this request's nonce. Next reads the nonce out of the
 * CSP on the request and stamps it on its own bootstrap scripts; the theme
 * script in the root layout reads it from the `x-nonce` header. An injected
 * <script> or onclick= cannot know it, so it will not run. That is why this
 * lives in the proxy rather than next.config: the nonce has to be new on
 * every request. `unsafe-eval` is only tolerated in development, where React
 * Fast Refresh requires it.
 */
function contentSecurityPolicy(nonce: string): string {
  return [
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
    //
    // No 'strict-dynamic': it would make browsers ignore 'self' and blob:,
    // and whether it vouches for ONNX's import() of a blob differs by browser.
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' blob:${isDev ? " 'unsafe-eval'" : ""}`,
    // The same backend also starts its threads as blob: workers.
    "worker-src 'self' blob:",
    // Styles stay inline-friendly: motion and Radix write style attributes,
    // which a nonce cannot cover, and CSS cannot run code.
    "style-src 'self' 'unsafe-inline'",
    // Signed storage links and the local object URL used for the upload preview.
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    // Supabase auth, database and storage.
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
    //
    // Open-Meteo is two hosts: api. for today's forecast, archive-api. for the
    // year of history the "what to buy next" panel reads. Named one by one
    // rather than *.open-meteo.com, like everything else here.
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.open-meteo.com https://archive-api.open-meteo.com https://huggingface.co https://*.hf.co https://cdn.jsdelivr.net/npm/${isDev ? " ws://localhost:*" : ""}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

/**
 * Refreshes the Supabase session on every request, gates the authenticated
 * routes, and sets a per-request CSP. (Next 16 renamed the `middleware`
 * convention to `proxy`.)
 */
export default async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);

  // On the request, so rendering can find the nonce. updateSession forwards
  // these headers with NextResponse.next({ request }).
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);

  const response = await updateSession(request);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, image files and the health endpoint.
     * /api/health is excluded so uptime pings never trigger a Supabase
     * session refresh. Every HTML page passes through here, which is what
     * gives each one its CSP.
     */
    "/((?!api/health|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
