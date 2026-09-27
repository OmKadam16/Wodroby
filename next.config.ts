import type { NextConfig } from "next";

/*
 * The Content Security Policy is set in src/proxy.ts, not here: it carries a
 * nonce that has to be new on every request, and these headers are static.
 */
const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.12.217"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
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
