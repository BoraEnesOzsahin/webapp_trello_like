# TaskFlow — Kanban MVP

Small Trello-like Kanban app (TaskFlow). This repo is configured for quick Vercel + Supabase deployment.

Quickstart (local)

1. Copy the example env and fill values:

```bash
cp .env.example .env
# Edit .env and add your SUPABASE_* values if using Supabase
```

2. Install and run:

```bash
npm install
npm run dev
# open http://localhost:3000
```

Deploy (Vercel + Supabase)

1. Create a Supabase project at https://app.supabase.com
2. In Supabase SQL editor run `supabase/init.sql` to create the `workspaces` table.
3. Go to Supabase Project → Settings → API and copy Project URL and Service Role Key.
4. Push this repo to GitHub and connect it in Vercel.
5. In Vercel project settings add Environment Variables:

- `SUPABASE_URL` = your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` = service role key (secret)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon key (optional)
- `NEXT_PUBLIC_USE_SUPABASE` = `true`

6. Deploy — Vercel will build and provide a public URL you can share.

Notes
- The app falls back to `localStorage` when Supabase is not configured.
- API route `GET/POST /api/workspace` reads/writes workspace JSON keyed by `userId`.

If you want, I can add a seed script and CI workflow next.
# TaskFlow

TaskFlow is a lightweight Kanban board built with Next.js, TypeScript, and dnd-kit.

## What it does

- Local account signup and sign-in
- Board creation with editable titles and descriptions
- Column creation and column title editing
- Card creation, editing, and drag-and-drop between columns
- Board, column, and card ordering that persists in localStorage
- Responsive layout for desktop and mobile browsers

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Notes

- Authentication is browser-local for the MVP and is not backed by an external identity provider.
- Ordering and workspace data are stored per user in localStorage so they survive refreshes on the same browser.