# Nudge — the homework buddy that never gives the answer

A voice-first, self-improving math tutor for primary-school kids.
The child snaps a photo of a homework problem, Nudge explains it **by voice** with
**interactive visuals**, guides with hints instead of answers, and **remembers what works
for this child** so it teaches better next time.

Scope: word problems, fractions, units. Language: English. Built in a few hours.

## What it does (and nothing else)

1. **Photo** → Claude reads the problem and privately solves it (answer stays on the server).
2. **Explains & teaches by voice** → push-to-talk, ElevenLabs STT/TTS, short spoken turns.
3. **GenUI** → the tutor draws interactive visuals (`FractionBars`, `NumberLine`, `BarModel`, `UnitLadder`).
4. **Self-improves** → a bandit learns which hint style works for this child.
5. **Memory** → after each session Claude writes what it learned about the child; it's loaded into the next session.

Out of scope: accounts, parent screens, onboarding, auth, deploy, databases. One hard-coded child (`demo`).

## Stack

- **App:** Expo (React Native, TypeScript), runs in Expo Go
- **Server:** Node + Express (TypeScript) on the laptop
- **Services:** Anthropic API + ElevenLabs — nothing else
- **Storage:** local JSON files in `data/` (Qdrant + local embeddings later, only if the main demo works)

```
Expo app ──HTTP──► Express server ──► Anthropic (vision, tutor, reflection)
                                  └─► ElevenLabs (STT, TTS)
                         data/memory.json · data/bandit.json · data/events.jsonl
```

## How teaching works

**Hint ladder** — help escalates when the child is stuck, never reaching the answer:

| Level | Hint |
|---|---|
| L1 | Question: "What does the story tell us?" |
| L2 | Concept reminder |
| L3 | Visual (GenUI component) |
| L4 | Simpler twin problem with smaller numbers |
| L5 | Worked first step |

Wrong answer or "I don't know" → level +1. Correct step → stay.
"Just tell me!" → rephrase, never reveal. Before speaking, the server checks the reply
doesn't contain the hidden answer; if it does, it regenerates.

## Self-improvement

**Bandit (per child, per topic):** hint styles `verbal` · `visual` · `story` · `smaller-numbers`,
each with Beta(α, β) counts. Thompson sampling picks the style for the next hint;
if the child makes progress within 2 turns → α+1, else β+1.
Code picks the strategy, Claude writes the words — so the learning is measurable.

**Memory:** at session end, Claude reads the session's events and updates `memory.json`
with short notes — misconceptions ("adds denominators"), what worked ("visuals for fractions"),
interests for analogies ("loves football"). Next session, notes for the current topic are put
into the tutor prompt.

**Visible in the app:** a "What Nudge learned" panel shows the bandit win rates and the memory notes.

## Data

`data/bandit.json`
```json
{ "fractions": { "verbal": [2, 6], "visual": [9, 2], "story": [4, 3], "smaller-numbers": [3, 3] } }
```

`data/memory.json`
```json
[
  { "topic": "fractions", "kind": "misconception", "text": "Adds denominators (1/4 + 1/4 = 2/8).", "seen": 3 },
  { "topic": "any", "kind": "interest", "text": "Loves football — use it in story hints.", "seen": 2 }
]
```

`data/events.jsonl` — one line per hint / attempt / outcome, input for the reflection step.

## API

| Endpoint | Does |
|---|---|
| `POST /problem` | image → `{ problemId, text, topic }` (answer kept server-side) |
| `POST /turn` | audio clip → `{ audioUrl, transcript, reply, ui? }` |
| `POST /session/end` | reflection → updates `memory.json` |
| `GET /learned` | bandit stats + memory for the panel |

Tutor tools: `show_component(type, props)`, `check_answer(value)`.

## Layout

```
mobile/   Expo app — screens: Camera, Talk, Learned; components/genui/*
server/   Express — problem.ts, tutor.ts, bandit.ts, memory.ts, voice.ts
data/     JSON files (gitignored)
```

## Run

`server/.env` (never commit):
```
ANTHROPIC_API_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
```

`mobile/.env`:
```
EXPO_PUBLIC_API_URL=http://<laptop-LAN-IP>:8787
```

```bash
cd server && npm install && npm run dev
```

```bash
cd mobile && npm install && npx expo start
```

## Demo (3 min)

1. Snap a real homework photo.
2. Child answers wrong → verbal hint → still stuck → `FractionBars` appear → child solves it.
3. "Just tell me!" → Nudge rephrases.
4. Second problem → Nudge goes straight to a visual hint; the "What Nudge learned" panel shows why.

## Build order

1. Photo → problem + hidden answer
2. Voice loop (push-to-talk → STT → Claude → TTS)
3. Hint ladder + answer check
4. GenUI components
5. Bandit + memory + "learned" panel
6. Seed a bit of history for the demo, rehearse

**Only after the main demo works end-to-end:**

7. **Embeddings + Qdrant (semantic memory)** — swap the topic filter for vector search.
   - `server/memory.ts` keeps one interface (`add`, `search`); `MEMORY_BACKEND=files` stays the default.
   - Embeddings: local model in Node (`@huggingface/transformers`, `all-MiniLM-L6-v2`) — no extra API.
   - Qdrant: `docker run -p 6333:6333 qdrant/qdrant`, set `MEMORY_BACKEND=qdrant` and `QDRANT_URL=http://localhost:6333`.
   - Search: embed the current problem → top 5 notes, filtered by `topic`.
   - If it breaks before the pitch, switch back to `files`.
