<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Devin plugins

ECC is required at project scope by `.devin/config.json`, pinned to an upstream commit. Start a new Devin session after changing plugin configuration. Verify discovery with `devin skills list` and configuration health with `devin doctor --json`. ECC skills use the `/ecc:<skill>` namespace; Claude-specific workflows and hooks may not be fully compatible with Devin.
