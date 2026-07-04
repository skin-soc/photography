import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

export default defineCloudflareConfig({
  // Serve the build-time prerendered pages (105 marketing routes × locales)
  // from the static-asset bundle instead of re-rendering them with React on
  // every request — the "dummy" default was full SSR per view, which is what
  // kept flirting with the free-tier 10ms CPU limit. Read-only: we have no
  // ISR, so a redeploy is the only way these pages change (that was already
  // effectively true for content).
  incrementalCache: staticAssetsIncrementalCache,
  // Serve those prerendered pages from the routing layer without booting the
  // Next.js server at all (middleware still runs first, so the admin gate and
  // host redirect are unaffected).
  enableCacheInterception: true,
});
