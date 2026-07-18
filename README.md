# Chouette — French Shadowing

Learn French by shadowing real YouTube clips leveled A1–B2, practice conversation with an AI tutor, and keep every new word and mistake in one place — synced to your own Anki deck.

## Features

- **Leveled clip library** — A1/A2/B1/B2 YouTube clips embedded via the official player, ranked by community favorites
- **Synced shadowing player** — line-by-line transcript synced to playback, record-yourself + playback comparison, tap any word to save it
- **AI conversation practice** — bring your own Anthropic or OpenAI API key; mistakes get flagged inline and saved to your error notebook
- **Error notebook** — every corrected mistake from AI practice, in one place
- **Vocabulary list** — words saved while shadowing, one-click sync to your own Anki deck via [AnkiConnect](https://ankiweb.net/shared/info/2055492159)
- **Auth** — GitHub / Google sign-in, per-user data

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript + Tailwind CSS
- [shadcn/ui](https://ui.shadcn.com) components
- [Drizzle ORM](https://orm.drizzle.team) + Postgres (tested with [Neon](https://neon.tech), available on the [Vercel Marketplace](https://vercel.com/marketplace))
- [Auth.js](https://authjs.dev) (NextAuth v5) for authentication
- [Vercel AI SDK](https://ai-sdk.dev) for the AI practice chat (BYOK — no server-side AI key required)

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up a Postgres database

Create a free Postgres database — [Neon](https://neon.tech) works well and is available directly from the [Vercel Marketplace](https://vercel.com/marketplace) if you're deploying there. Copy the connection string.

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

- `DATABASE_URL` — your Postgres connection string
- `AUTH_SECRET` — generate with `npx auth secret`
- `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` — from a [GitHub OAuth app](https://github.com/settings/developers) (callback URL: `http://localhost:3000/api/auth/callback/github`)
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — from a [Google OAuth app](https://console.cloud.google.com/apis/credentials) (callback URL: `http://localhost:3000/api/auth/callback/google`)

You only need one of GitHub or Google configured to sign in.

### 4. Push the database schema

```bash
npm run db:push
```

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## AI practice — bring your own key

The AI conversation practice page asks each user to paste their own Anthropic or OpenAI API key. It's stored only in the browser's `localStorage` and sent directly with each chat request — it is never written to the database or seen by the server beyond proxying the request. This keeps the app free to self-host and run.

## Anki sync

Vocabulary syncing uses [AnkiConnect](https://ankiweb.net/shared/info/2055492159), a free Anki add-on:

1. Install Anki (desktop) and the AnkiConnect add-on (code `2055492159`)
2. Keep Anki open while using the Vocabulary page
3. Set your deck name in the Vocabulary page and click "Sync all unsynced" or the send icon on any word

New cards are created with a `Basic` note type (`Front` = word, `Back` = translation/context) and tagged `chouette`, `french-shadowing`.

## Content sourcing

Clips are added by pasting a YouTube URL. The app fetches the video title/channel via YouTube's official oEmbed endpoint and a best-effort transcript from YouTube's public caption track — nothing is downloaded or rehosted, playback always happens through the official embedded player, staying within YouTube's Terms of Service. If a video has no French captions available, add it anyway and note that shadowing text isn't available yet.

## Database scripts

- `npm run db:push` — push the current schema to your database (good for local dev)
- `npm run db:generate` — generate a SQL migration from schema changes
- `npm run db:migrate` — apply generated migrations
- `npm run db:studio` — open Drizzle Studio to browse your data

## Deploying

Deploys cleanly to [Vercel](https://vercel.com/new). Add the same environment variables from `.env.example` in your Vercel project settings, and provision a Postgres database via the Vercel Marketplace (Neon).
