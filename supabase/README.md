# Accounts (Supabase)

Google sign-in and saved portfolios. Everything else in Aperture works without this: with no Supabase variables set,
the sign-in button is hidden and portfolios stay in the browser session.

1. Create a Supabase project and run `migrations/20260926000000_accounts.sql` (SQL editor, or `supabase db push`).
   It creates `profiles` (experience level), `portfolios` (`kind`: real, practice, demo) and `holdings`, all with
   Row Level Security so a user can only read and change their own rows.
2. Authentication → Providers → Google: enable it with a Google OAuth client ID and secret.
3. Authentication → URL Configuration: add the site URL and `https://<your-domain>/**` (and `http://localhost:3000/**`)
   to the redirect allow list. Sign-in returns to the page it started from.
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project settings → API) and redeploy.

`npx -y tsx scripts/check-rls.ts` runs the migration on an in-process Postgres (PGlite) and checks that one user can't
read, change or add to another user's portfolios and holdings.

## Hosted project

- Supabase project `shellhacks 26` (ref `ltjcvbazucxtnqfwdmss`, East US), migration applied.
- Site URL `https://aperture-rosy.vercel.app`; redirect URLs `https://aperture-rosy.vercel.app/**` and
  `http://localhost:3000/**`. If sign-in lands on `localhost:3000/?code=…` or another deploy, the Site URL is wrong
  or the page's origin isn't in the redirect list: Supabase falls back to the Site URL.
- Google OAuth client redirect URI: `https://ltjcvbazucxtnqfwdmss.supabase.co/auth/v1/callback`. The Google app is in
  Testing, so only test users added under Google Auth Platform → Audience can sign in.
- Vercel: `NEXT_PUBLIC_SUPABASE_URL` covers every environment; `NEXT_PUBLIC_SUPABASE_ANON_KEY` is production only, so
  preview deploys hide sign-in until it's added there too. The anon key is public by design (type Config, not
  Sensitive); never give `SUPABASE_SERVICE_ROLE_KEY` a `NEXT_PUBLIC_` prefix.
- Local: put the same two variables in `.env.local`.
