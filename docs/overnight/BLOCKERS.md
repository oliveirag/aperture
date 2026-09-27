# Overnight blockers

## Resolved: installed Next.js guide access

Observed in iteration 1 on 2026-09-27.

The repository requires reading the version-specific Next.js guides before writing code. The read tool denied:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md`

Decisive error: `Access denied ... is matched by an ignore file ... The agent is not allowed to read or modify ignored files.`

Earlier `request_scope` did not override Desktop's ignore policy. In iteration 3 the read tool successfully read the installed route-handler and fetch guides, relevant cache guidance, and the actual `generate-agent-files.js` source confirming the managed AGENTS block. Access is resolved; do not restart this investigation.

## Resolved: full lint included protected local audit material

Iteration 2: the user explicitly approved resolving the access/lint blockers. Reproduced the three `@typescript-eslint/no-require-imports` errors in `docs/audit-2026-09-27/extract-inventory.cjs`, then added only `docs/audit-2026-09-27/**` to the existing ESLint global ignores. The protected file was not edited or committed. No application lint rule was disabled or weakened.

`npm run lint && git diff --check` passed (exit 0), with zero lint warnings. Code and TypeScript reviewers approved the precise scope. The audit extractor is intentionally outside the application lint boundary under the user's approval.

## Open: remote Supabase mutations must remain disabled

Source inspection found `src/lib/cache.ts` can invoke `sharedLoad`, which calls `src/lib/imports/provider.ts` RPCs to reserve quota, claim cache leases and save results. These write remotely when Supabase is configured. Existing webhooks/import/account paths can also write.

Baseline scripts ran with Supabase URL, anon key and service-role key explicitly blank in the child process, and remote KV configuration blank. Production build additionally disabled market and Gemini keys. `.env.local` itself was not modified. Future live tests/dev servers must maintain this isolation, not merely avoid migration commands.

Team action after the mission: review and apply any pending import/provider-cache migrations to the intended Supabase project separately. This session has not checked or changed the remote schema and must not do so.

## Open: harness specification versus installed plugin

The project already loads pinned ECC v2.2.1 through `.devin/config.json`. Reusing the pinned plugin avoids duplicate agent/skill discovery. Nine new workstream/verifier profiles, a shared mission skill, and `.devin/README.md` are now present; `devin doctor --json` recognizes 77 profiles. Common rules are referenced rather than duplicated verbatim in each profile. Literal `.claude/skills` vendoring in the original mission is not claimed; the operational harness uses the previously approved existing plugin.

`agentshield` is not installed. Use a bounded manual review of the new project harness; do not install an unreviewed CLI or hooks overnight.

## Permissions to allow

- Guide access is resolved. Future background denials must be reported once with the exact denied command, then handled in the foreground if permitted. Do not repeatedly retry denied operations.
- Live lock deliberately fails closed after a crash. Timeout reports validated owner PID/acquisition time; never auto-delete based only on lock age. Operator recovery requires checking that no worker owns it and explicit permission to remove that specific orphan.

## Not blockers, but important limits

- The mission incorrectly assumed the three protected local paths were already in `.git/info/exclude`. They were not. This session added only those exclusions locally; their contents remain unchanged and uncommitted.

- The mission's 19 existing `scripts/check-*.ts` files are deterministic checks, not real-provider fixture/live dual-mode checks. Passing them with an ignored `--live` argument would not be evidence.
- Feature waves, the Playwright matrix and independent source traces remain outstanding. One real Apple submissions fixture is captured; that alone does not establish any feature's live completeness.
- Shared provenance validation checks shape, not source authenticity or correct numeric calculations. Each provider adapter must bind trusted hosts and preserve raw-source evidence; final independent traces remain mandatory.
- The mission's full completion criteria remain unmet; never create DONE.md on the basis of this baseline.
