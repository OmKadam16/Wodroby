import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Wardroby has no prerendered or incrementally-cached routes — every page is
 * server-rendered on demand against the signed-in user's Supabase session —
 * so no incremental cache backend (R2/KV) is configured. That keeps the
 * Cloudflare setup to a single Worker with no extra billable resources.
 */
export default defineCloudflareConfig();
