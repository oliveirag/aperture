# Overnight blockers

## Open: installed Next.js guides are unreadable to the agent

Observed in iteration 1 on 2026-09-27.

The repository requires reading the version-specific Next.js guides before writing code. The read tool denied:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md`

Decisive error: `Access denied ... is matched by an ignore file ... The agent is not allowed to read or modify ignored files.`

`request_scope` for read access to `node_modules/next/dist/docs` returned `Scope granted`, but each subsequent read still failed with the same ignore-policy denial. The user was notified. Needed action: enable agent read access to this installed documentation directory through the IDE's supported access controls. Do not bypass this denial using shell reads, symlinks or copied files. No application code has been changed while this prerequisite is blocked.

## Open: full lint includes protected local audit material

`npm run lint` exits 1 with three `@typescript-eslint/no-require-imports` errors at columns 10, 29 and 48 of line 1 in `docs/audit-2026-09-27/extract-inventory.cjs`.

The mission explicitly prohibits editing, committing or deleting this local audit directory. Git exclusion does not exclude files from ESLint. No lint rules or ignore configuration were weakened. Needed decision: authorize a precise tooling scope change for this local-only artifact, or have its owner resolve the audit script. The exact full lint gate remains failed until then; scoped lint is not a substitute.

## Open: remote Supabase mutations must remain disabled

Source inspection found `src/lib/cache.ts` can invoke `sharedLoad`, which calls `src/lib/imports/provider.ts` RPCs to reserve quota, claim cache leases and save results. These write remotely when Supabase is configured. Existing webhooks/import/account paths can also write.

Baseline scripts ran with Supabase URL, anon key and service-role key explicitly blank in the child process, and remote KV configuration blank. Production build additionally disabled market and Gemini keys. `.env.local` itself was not modified. Future live tests/dev servers must maintain this isolation, not merely avoid migration commands.

Team action after the mission: review and apply any pending import/provider-cache migrations to the intended Supabase project separately. This session has not checked or changed the remote schema and must not do so.

## Open: harness specification versus installed plugin

The project already loads pinned ECC v2.2.1 through `.devin/config.json`. Adding the same agents and skills again under `.claude/` would duplicate the installed surface. Reuse the loaded plugin and put genuinely new project configuration in `.devin/`. Workstream-specific profiles and the shared provenance/fixture contracts are not yet created. Literal vendoring completion is not claimed.

`agentshield` is not installed. Use a bounded manual review of the new project harness; do not install an unreviewed CLI or hooks overnight.

## Permissions to allow

- Read access to installed Next.js guides as above. No background tool permission failures yet: no background workstream agents launched.

## Not blockers, but important limits

- The mission incorrectly assumed the three protected local paths were already in `.git/info/exclude`. They were not. This session added only those exclusions locally; their contents remain unchanged and uncommitted.

- The mission's 19 existing `scripts/check-*.ts` files are deterministic checks, not real-provider fixture/live dual-mode checks. Passing them with an ignored `--live` argument would not be evidence.
- All feature waves, recorded real fixtures, the Playwright matrix and independent source traces remain outstanding.
- The mission's full completion criteria remain unmet; never create DONE.md on the basis of this baseline.
