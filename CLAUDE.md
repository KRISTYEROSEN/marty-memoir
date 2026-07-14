# Marty's Story — AI Memoir App

## What this is
A voice-based AI biographer for Marty Kupersmith (stage name Marty Sanders), 82, guitarist/songwriter of Jay and the Americans, herpetologist, Warwick NY local. He opens the app, an ElevenLabs voice interviews him like a warm radio journalist, his spoken stories are recorded, transcribed, filed into emergent book chapters, and ghostwritten into memoir prose. Built for ONE user (Marty) by Kristy, who reads everything from the admin panel and is writing his book.

- **Live:** https://marty-memoir.vercel.app (Vercel, auto-deploys from `main`)
- **Owner workflow:** Kristy is non-developer but capable; explain steps concretely, verify before committing (`findstr` checks), never assume a paste worked.

## Stack
- Frontend: single-file React (Vite) — `src/App.jsx` is the entire UI + logic
- Backend: Vercel serverless functions in `api/`
- Storage: Vercel Blob, store **marty-memoir-blob**, **PUBLIC access** (deliberate: private stores broke uploads; public = unguessable URLs, acceptable for book-bound content)
- AI: Anthropic API (claude-sonnet-4-6) for interviewing/classification/ghostwriting
- Voice: ElevenLabs TTS (voice ID `EIsgvJT3rwoPvRFG6c4n`, model eleven_multilingual_v2, stability 0.32, similarity 0.85, style 0.45) and Scribe v1 STT

## Environment variables (Vercel project settings)
- `VITE_API_KEY` — Anthropic key (used server-side in api/chat.js and api/research.js despite the VITE_ name; do not expose client-side)
- `ELEVENLABS_API_KEY` — TTS + STT
- `BLOB_READ_WRITE_TOKEN` — required by @vercel/blob client uploads; env vars only apply after a redeploy
- `BLOB_STORE_ID`, `BLOB_WEBHOOK_PUBLIC_KEY` — auto-added by store connection

## api/ endpoints
- `chat.js` — proxy to Anthropic /v1/messages (browser can't call Anthropic directly)
- `speak.js` — text → ElevenLabs TTS mp3
- `transcribe.js` — takes `{ audioUrl }`, fetches audio from Blob, sends to ElevenLabs STT. (URL-based on purpose: Vercel functions reject bodies > ~4.5MB; WAV is big)
- `upload.js` — handleUpload token endpoint for @vercel/blob client uploads
- `save.js` — persists entry JSON to `entries/{id}.json` (allowOverwrite)
- `entries.js` — lists + fetches all entries
- `research.js` — web-search dossier about Marty → `research/dossier.json`
- `dossier.js` — reads the dossier
- `book.js` — GET/POST book draft at `book/draft.json`

## HARD-WON iOS AUDIO LESSONS — do not regress these
1. **MediaRecorder is broken on iOS Safari in this app's pattern.** Playing TTS audio then recording produces 0-byte recordings (audio session mute; a second getUserMedia mutes the first, and playback interruptions mute capture with no unmute). We abandoned MediaRecorder entirely.
2. **Recording = Web Audio WAV capture**: one shared AudioContext for BOTH playback and capture; ScriptProcessor collects Float32 samples; `encodeWav()` packs 16-bit mono WAV. Processor routes through a **zero-gain node** to destination (required to keep it running without monitoring/feedback).
3. **Audio unlock**: iOS only allows sound after a user gesture. `unlockAudio()` creates/resumes the AudioContext on "Tap to begin" (and mode buttons as backup). `playBuffer` has a duration+1.5s safety timeout so a stalled playback can never freeze the flow.
4. **Playback queue** (`playbackQueueRef`) serializes all speech so cached acks and generated questions never overlap.
5. **Phrase cache**: fixed lines (greeting, "Go ahead…", acks, goodbye) are prefetched from ElevenLabs at session start and replayed instantly from decoded buffers.

## Conversation design (deliberate choices — Kristy cares about these)
- **No voice-intent detection.** Tried it; too slow/unreliable. Modes are buttons: ✨ Story Mode / 🎤 Interview Mode / 📷 picture.
- **One-button loop**: she asks → recording auto-starts → Marty talks → taps DONE → instant cached ack (rotating neutral-safe phrases from `ACKS` — never emotionally-colored, because the ack plays before we know what he said) → transcribe/save runs behind the ack → AI reacts THEN asks (empathy rules below) → auto-listens again.
- **Empathy rules** (in prompts): react like a human first; if he expresses sadness, respond with compassion and an open door, never cheerfulness or subject change; no "how are you today" filler; never the word "journey"; never summarize his answer back.
- **🌙 That's all for today** button during recording: saves what he was saying, warm goodbye, returns to welcome.
- **Blank transcript = honest retry**, never fake-continue.
- **Chapters are emergent**: `SEED_CHAPTERS` are suggestions only; classification may coin new chapter names; all chapter lists derive from actual entries (`orderedChapters()`). No caps or limits on anything, per Kristy.
- **Admin panel**: tap header 5×. Tabs: Answers (transcripts + audio), Chapters (date-ordered w/ transcripts), Book (ghostwrites memoir prose per chapter from transcripts, first person, facts-only, saved to blob), Research (builds dossier).
- Welcome screen: `/public/marty.jpg` portrait background; `/public/apple-touch-icon.png` home-screen icon; index.html has apple-touch-icon + "Marty's Story" title.

## Known items deliberately left
- Photo prompt can occasionally drift off-image (a stricter prompt exists but wasn't applied — ask Kristy before changing)
- Admin panel has no password (obscurity via 5-tap only)
- Old test entries may exist depending on whether the store was wiped
- `isListeningIntent` state is vestigial (harmless)

## App Store / Google Play goal (the next project)
Realistic path and REQUIRED scope changes:
1. **Wrap, don't rewrite**: Capacitor around the existing React app is the sane route; Capacitor native audio plugins can replace the Web-Audio WAV workaround with proper native recording (the iOS pain above is a *browser* problem).
2. **Multi-user is mandatory before public distribution**: the current app hardcodes Marty everywhere (name, prompts, dossier, single shared blob namespace) and — critically — **server-side API keys pay for every user**. A store app needs accounts/auth, per-user storage namespaces, per-user dossiers/config (subject name, seed chapters, voice), and usage limits/billing or the owner's Anthropic+ElevenLabs bills are unbounded.
3. Apple Developer ($99/yr) + Google Play ($25 one-time) accounts; App Store review requires privacy policy (voice recordings = biometric-adjacent data — take this seriously), account deletion, etc.
4. Suggested architecture evolution: keep Vercel backend; add auth (e.g. Clerk/Supabase); entries under `users/{uid}/entries/…`; a "subject profile" object replaces hardcoded Marty facts in prompts.

## Working conventions that served this project
- Verify file edits landed before committing (search for a string unique to the new version)
- Compile-check before shipping (esbuild syntax pass)
- Vercel Logs tab is the truth for runtime failures; GitHub raw is the truth for what's deployed
- Env var changes require a redeploy to take effect
