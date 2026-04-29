# WordSketch

WordSketch is a small full-stack study app for translating between English and Hebrew, turning useful phrase pairs into illustrated flashcards, and reviewing them with a weight-based deck that pulls missed cards back sooner.

## Stack

- `client`: React + Vite + TypeScript
- `server`: Express + TypeScript + SQLite (`better-sqlite3`)
- `shared`: shared API contracts and types

## Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the server env template if you want real AI calls:

   ```bash
   cp server/.env.example server/.env
   ```

3. Start the app:

   ```bash
   npm run dev
   ```

4. Open:

   - Client: `http://localhost:5173`
   - Server: `http://localhost:4000`

## AI integration

If `server/.env` does not contain an API key, the app runs in mock mode:

- translation returns an explicit mock translation
- image generation writes a local SVG placeholder illustration

In live mode, Hebrew translations are requested with nikud.
Speech playback uses OpenAI audio and is cached locally after the first generation so replay does not recompute.

For live mode with the official OpenAI API, set:

- `OPENAI_API_KEY`

For image generation, this app now uses FAL Flux Schnell. Set:

- `FAL_KEY`

For Google sign-in, set:

- `GOOGLE_CLIENT_ID`

The defaults are already set for local development:

- `OPENAI_BASE_URL=https://api.openai.com/v1`
- `OPENAI_TEXT_MODEL=gpt-5.4-mini`
- `OPENAI_AUDIO_MODEL=gpt-4o-mini-tts`
- `OPENAI_AUDIO_VOICE=cedar`
- `FAL_IMAGE_MODEL=fal-ai/flux/schnell`

You can still override text and image endpoints separately with the older provider-style variables:

- `LLM_API_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL`
- `IMAGE_API_BASE_URL`
- `IMAGE_API_KEY`
- `IMAGE_MODEL`

## Review weighting

The flashcard deck uses a weighted random sampler instead of a strict queue:

- each card starts at weight `1.0`
- `Oops` multiplies weight up sharply (`weight * 1.8 + 0.75`)
- `Got it!` lowers weight (`weight * 0.74 - 0.15`) and gets a bit more generous as a correct streak grows
- cards reviewed very recently get a temporary penalty so the same card does not bounce back immediately
- cards unseen for longer slowly drift upward in probability

That gives the deck a useful rhythm: missed cards do return sooner, but not so fast that the session turns into the same two prompts repeating.

## Tests

Run the scheduler tests with:

```bash
npm test
```
