# Graduation Party 🎓

Graduation event platform: guests submit childhood + adult photos through a public flow, the app generates an AI graduation-cap portrait for each graduate, and the organizer runs the ceremony from an admin control room — a queue of graduates is displayed on a **projector screen** that only ever shows the current graduate, never the queue or admin UI.

## Features

- **Public submission flow** — upload childhood + adult photos (image validation: format, resolution, EXIF scrub), optional AI cap preview, submit individual or as a family/group. Server-authoritative `submitted_at` timestamps.
- **AI graduation-cap generation** — OpenAI Images API provider, with a deterministic **offline** provider as development/test default. Full failure handling: `FAILED` state, friendly error, retry flow, staged-then-commit asset semantics.
- **Admin control room** — password login with hashed cookie sessions, dashboard stats, participant CRUD, manual add, search/filter, CSV/XLSX exports (names-only and full-backup variants).
- **Draft/change system** — every admin edit is recorded as a draft with **optimistic locking** (stale-version conflicts), `keepLocal`/`keepDb` resolution, save/discard, unsaved-changes logout warning and previous-session reminder.
- **Presentation engine** — queue management (reorder via draft, skip, jump, replay, restart), auto/manual mode, pause/resume, loop on/off, configurable per-slide durations.
- **Projector** — token-protected screen and SSE realtime feed. Payloads are deliberately minimal: only the current graduate's name/photos/durations — **no queue, no other names, no admin controls, no DB leaks**. Invalid/absent token → friendly screen or `401`.
- **Realtime** — SSE fanout (in-memory per instance + Postgres `LISTEN/NOTIFY` across instances), Vercel-serverless compatible.
- **Storage abstraction** — Vercel Blob in production, local disk provider for dev/test. **No mock production data**: the dev seed refuses to run when `NODE_ENV=production`.

## Tech stack

- [Next.js 15](https://nextjs.org) (App Router, server components/actions, route handlers) + React 19 + TypeScript 5.9
- [Drizzle ORM](https://orm.drizzle.team) + `pg` with versioned SQL migrations
- PostgreSQL (embedded Postgres for local dev), [Vercel Blob](https://vercel.com/docs/storage/vercel-blob), [Zod](https://zod.dev), sharp, exceljs, Tailwind CSS 4

## Getting started (development)

Requirements: Node 20+.

```bash
npm install

# 1. Embedded PostgreSQL (data in .pgdata/, port 55432)
npm run db:start

# 2. Migrations (applies ./drizzle/*.sql)
npm run db:migrate

# 3. Optional dev seed: 8 graduates (3 individual + 2 group submissions), 24 assets
npm run db:seed

# 4. Run the app
npm run dev          # http://localhost:3000
```

Default admin password in development is `cu` (override with `ADMIN_PASSWORD`).

Environment: copy `.env.example` to `.env.local` and adjust. Never commit real secrets (`.env*` is gitignored).

### Local verification gates

```bash
npm run typecheck    # tsc --noEmit
npm run build        # next build
npm test             # vitest unit tests
```

### Production E2E suite

The full HTTP E2E suite (`scripts/e2e-production.ts`) runs against a real `next start` server + PostgreSQL and asserts DB/storage state after every step. It creates `Tst*` records and cleans them up, restoring settings + queue.

```bash
npm run build
npx next start -p 3100          # terminal 1 (start a FRESH process per run)
npx tsx scripts/e2e-production.ts   # terminal 2
```

Covered: public pages & guards, admin login/session, image validation, AI generation + failure/retry, individual & group submissions, server timestamps, stats/search/filter, manual add, drafts with optimistic locking, save/keepLocal/keepDb/discard, image replacement + storage cleanup, per-participant delete, whole-group delete, settings, projector token security, realtime sync (admin + projector SSE), full presentation lifecycle (start/pause/resume/replay/next/previous/jump/skip/restart/loop/finish), queue reorder, CSV/XLSX exports, logout warning, previous-session reminder, zero-orphan/storage-file accounting.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build / start |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm test` | Unit tests (vitest) |
| `npm run e2e` | Production HTTP E2E suite (see above) |
| `npm run db:start` / `db:stop` | Start/stop embedded PostgreSQL (dev) |
| `npm run db:generate` / `db:migrate` / `db:push` | Drizzle migration tooling |
| `npm run db:seed` | Development seed (refuses to run in production) |

## Production deployment (Vercel)

1. **Database** — create a PostgreSQL database on Neon, Supabase, or RDS.
   - `DATABASE_URL`: pooled connection string (serverless-friendly).
   - `DIRECT_URL`: direct/transactional string — used by migrations and long-running scripts (required when `DATABASE_URL` is a PgBouncer/Supavisor pooled URL).
2. **Storage** — create a Vercel Blob store; set `STORAGE_PROVIDER=blob` and `BLOB_READ_WRITE_TOKEN` (added automatically as `BLOB_READ_WRITE_TOKEN` when you connect a Blob store in the Vercel dashboard).
3. **AI** — for real cap generation set `AI_PROVIDER=openai` + `AI_API_KEY` (and optionally `AI_MODEL`, `AI_IMAGE_SIZE`). Without a key the app stays fully usable with the offline provider — but production events should use OpenAI.
4. **Admin** — set a strong `ADMIN_PASSWORD`. Add `SESSION_COOKIE_SECURE=true` and `APP_BASE_URL=https://<your-app>.vercel.app`.
5. **Migrations** — from your machine against the production database:
   ```bash
   DIRECT_URL=<prod direct url> npx drizzle-kit migrate
   ```
6. **Deploy** — push to GitHub and import the repo in Vercel (framework preset: Next.js). Build command `npm run build`; the seed script will not run in production.
7. **Smoke test** — after deploy: `/`, `/add`, `/admin/login`, dashboard, one public submission, admin APIs, and `/presentation/<token>` (create the token from the control room).

> The app **requires** `DATABASE_URL` in production (`NODE_ENV=production` without it fails fast at startup paths rather than silently serving broken pages).

## Security notes

- Admin session tokens are stored hashed; only a hash lives in the DB.
- Uploaded images are validated (magic bytes, resolution floor, kind allowlist) and re-encoded to strip metadata.
- Projector endpoints are token-gated; the public/realtime payloads contain no queue, no other participants' data, and no DB internals (asserted by the E2E suite).
- Security headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`) set globally; `poweredByHeader` disabled.

## License

MIT
