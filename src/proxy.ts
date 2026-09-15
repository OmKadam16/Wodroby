import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Refreshes the Supabase session on every request and gates the authenticated
 * routes. (Next 16 renamed the `middleware` convention to `proxy`.)
 */
export default async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, image files and the health endpoint.
     * /api/health is excluded so uptime pings never trigger a Supabase
     * session refresh.
     */
    "/((?!api/health|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
