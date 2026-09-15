# Closingly

Next.js 16 app deployed to Cloudflare Workers via `@opennextjs/cloudflare`, with Supabase for auth and data.

## Local development

```bash
npm install
npm run dev
```

Copy the variable names from `.env.local` of an existing setup; see `wrangler.jsonc` for the Worker config.

## Deploy

Pushing to `main` deploys through Cloudflare Workers Builds (build: `npx opennextjs-cloudflare build`, deploy: `npx wrangler deploy`). Production runs at https://app.closingly.app.
