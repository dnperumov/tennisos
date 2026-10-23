# TennisOS

A private, voice-first tennis coach. Talk to it like ChatGPT voice; it keeps your match results, journal notes and focus areas up to date as you talk.

## Screens

- **Coach** — the tennis ball is the coach. Its felt deforms with the coach's voice; chalk rings ripple off it while you talk. Tap it to start or end a conversation, or type instead. Anything the coach saves appears as a chip you can tap to jump to.
- **Matches** — scoreboard view of every result, with linked notes.
- **Notes** — journal grouped by day, filterable by type (match, practice, tactics, mindset, fitness).
- **Focus** — development areas by priority (now / next / later), with cues, drills and progress. Coach hypotheses are shown dashed until confirmed.

Everything can also be added or edited by hand.

## How the AI changes the app

Voice uses the OpenAI Realtime API over WebRTC (`/api/realtime` mints a 10-minute client secret; audio goes straight from the browser to OpenAI). Typed messages use the Responses API through `/api/coach`.

Both share the tools in `api/_tools.js` — `log_match`, `update_match`, `add_note`, `set_focus_area`, `update_profile`, `delete_item`, `get_workspace`. The model calls them, the browser runs them against your data (`js/actions.js`) and returns the result, and the coach confirms what it saved. A snapshot of your workspace is sent with every session so the coach knows your history.

## Deploy (Vercel)

Set in Vercel → Project → Settings → Environment Variables, then redeploy:

| Variable | Required | Default |
| --- | --- | --- |
| `OPENAI_API_KEY` | yes | — |
| `OPENAI_REALTIME_MODEL` | no | `gpt-realtime` |
| `OPENAI_VOICE` | no | `marin` |
| `OPENAI_TEXT_MODEL` | no | `gpt-5-mini` |

No build step: static files plus three serverless functions in `api/`.

## Data

Stored in this browser's localStorage. Use the ⋯ menu to download a backup or restore one on another device. Cloud sync isn't built yet.

## Demo

Open `/?demo` to run a scripted conversation (no API key, separate throwaway storage) — useful for checking the orb and the save flow.
