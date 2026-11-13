# Nudge — the homework buddy that never gives the answer

A voice-first, **agentic**, self-improving math tutor for primary-school kids.

A parent or teacher uploads the **textbook chapter** the class is working on. An agent turns it
into a mini-curriculum: short written lessons and verified practice problems, taught **the same
way the textbook does**. The child practices with a **voice tutor** that guides with hints and
interactive visuals — never the answer — and after every session a planner agent **re-plans**
what comes next. Kids can also just **snap a photo** of any homework problem.

Scope: primary maths (word problems, fractions, units). Language: English. Built in a few hours.

**Why not NotebookLM / ChatGPT?** Those summarize and answer. Nudge is for kids: it talks,
it refuses to give the answer, it follows the class textbook's method, and it adapts to one
specific child over time.

## What it does

1. **Textbook → curriculum (agent):** reads the PDF/photo → plans 3–5 lessons → writes kid-friendly
   lessons + worked examples → generates practice problems → **verifies every answer with `mathjs`**.
   Progress is streamed live as an agent trace.
2. **Written lessons:** explanation, worked example, a visual, "from your textbook p. X".
3. **Voice tutor (agent loop):** push-to-talk → ElevenLabs STT → Claude tool loop → ElevenLabs TTS.
   Hints L1–L5, GenUI visuals, grounded in the lesson's method.
4. **Photo homework:** snap any problem → same tutor.
5. **Self-improvement:** bandit learns which hint style works; memory notes are written during and
   after sessions; the planner updates lesson mastery, schedules review and creates a warm-up.
6. **Visible agency:** a "Nudge is thinking" panel shows every step the agent took.

Out of scope: accounts, auth, deploy. One hard-coded child (`demo`).

## Stack

- **App:** Expo (React Native, TypeScript) — Expo Go on a phone or the browser
- **Server:** Node + Express (TypeScript) on the laptop
- **Services:** Anthropic API + ElevenLabs — nothing else
- **Storage:** local JSON files in `server/data/` (source of truth) + a local **Qdrant** vector index for long-term semantic memory (standalone binary, no Docker)

```
Expo app ──HTTP──► Express server ──► Anthropic: Opus (textbook, photo, planner), Sonnet (tutor loop)
                                  └─► ElevenLabs (STT, TTS)
                                  └─► Qdrant (local child process) + all-MiniLM-L6-v2 embeddings (in-process, WASM)
             server/data: curriculum.json · memory.json · bandit.json · events.jsonl · sessions.json
```

## The agents

| Agent | When | Does | Tools / output |
|---|---|---|---|
| **Curriculum builder** | textbook uploaded | read → plan lessons → write lessons → generate + verify problems | `curriculum.json`, live trace |
| **Tutor** | every child turn | multi-step tool loop, ends by speaking | `recall_memory`, `get_strategy_advice`, `show_component`, `check_answer`, `check_step`, `write_memory`, `speak` |
| **Reflector** | session end | turns events into memory notes | `memory.json` |
| **Planner** | session end | lesson mastery/status, next lesson, new warm-up problem | `curriculum.json`, plan + trace |

**The agent decides, code guards the edges:** the hidden answer never leaves the server, a
leak guard checks every reply and visual, problems are only used if `mathjs` verifies them, and
the bandit's advice can be overridden only with a logged reason.

## How teaching works

**Hint ladder** — help escalates when the child is stuck, never reaching the answer:

| Level | Hint |
|---|---|
| L1 | Question: "What does the story tell us?" |
| L2 | Concept reminder (in the textbook's words) |
| L3 | Visual (GenUI: `FractionBars`, `NumberLine`, `BarModel`, `UnitLadder`) |
| L4 | Simpler twin problem with smaller numbers |
| L5 | Worked first step |

"Just tell me!" → rephrase, never reveal.

## Self-improvement

- **Bandit (per child × topic):** styles `verbal` · `visual` · `story` · `smaller-numbers`, Beta(α, β).
  The tutor asks for advice, may override with a reason; reward = progress within 2 turns.
- **Memory:** the tutor writes notes mid-session (`write_memory`); the reflector consolidates them
  at session end (misconceptions, what works, interests, mastered skills).
- **Planner:** marks lessons mastered / review, picks the next lesson, and writes a **warm-up
  problem targeting the biggest misconception** — shown on the home screen next time.
- **Visible:** "What Nudge learned" (win rates, notes, hints per problem over sessions) and
  "Plan for next time".

## Long-term memory (Qdrant)

Keyword recall only finds a note when the words match. The vector memory finds it by **meaning**, across days:
today's "two eighths" is matched to last week's "I added the tops and the bottoms" and to the note
"Adds denominators", even with no word in common.

| Collection | One point per | Used for |
|---|---|---|
| `nudge_notes` | memory note (`memory.json`) | `recall_memory` by meaning; `write_memory` confirms an existing note instead of adding a near-duplicate |
| `nudge_attempts` | moment the child struggled (`events.jsonl`: wrong / "I don't know" / "just tell me"): lesson skill + problem + what the child said, with how long the answer took and whether the next hint helped | see below |

Where it changes behaviour:

- **Hints (every turn):** before the tutor thinks, the most similar past struggles are fetched (local embedding +
  Qdrant, tens of milliseconds, hard 400 ms timeout) and handed to it with what happened next: *"2 days ago, similar problem,
  said 'three twelfths'. Next hint: visual L2 → HELPED."* The tutor prefers what helped and may override the bandit.
- **Next question:** `POST /lesson/problem` no longer takes the first unsolved problem, but the unsolved one closest
  to what was hard before (recent and unresolved struggles weigh more; harder problems need a stronger match).
- **Next day:** the planner searches all earlier sessions for today's mistakes, so the warm-up and "review" target
  what keeps coming back (plus slow answers), not a one-off slip.

All of it shows up in the "Nudge is thinking" trace ("Long-term memory: a similar moment went wrong 2 days ago → visual hint helped").

How it runs: on first start the server downloads the official Qdrant binary for the machine (macOS Intel/Apple
Silicon, Linux x64/arm64, Windows x64; pinned version, sha256-verified) and the embedding model (23 MB) into
`server/.vector/`, starts Qdrant as a child process on `127.0.0.1:6333` (storage in `server/data/qdrant/`) and
stops it when the server stops. Embeddings are computed in-process with WebAssembly: no Python, no embedding API,
texts never leave the laptop. `npm run vector:setup` fetches both ahead of time (bad wifi at the venue).

The JSON files stay the source of truth. The index is re-synced from them on every start and can be deleted at
any time; if Qdrant is missing, still starting or slow, everything falls back to the old keyword recall.
`MEMORY_BACKEND=json` turns it off, `QDRANT_URL` (+ `QDRANT_API_KEY`) points at an existing Qdrant instead.

## API

| Endpoint | Does |
|---|---|
| `POST /textbook` → `GET /textbook/job/:id` | start curriculum build, poll live trace |
| `GET /curriculum` | lessons, statuses, next lesson, warm-up |
| `POST /lesson/problem` | start a practice / warm-up problem |
| `POST /problem` | photo → problem (answer kept server-side) |
| `POST /session/start` · `POST /turn` | tutor turn (audio, text or UI event) → reply + trace |
| `POST /session/end` | reflection + planner → notes + plan |
| `GET /learned` | bandit stats, memory, progress |
| `GET /vector/status` | vector memory state, point counts |
| `GET /vector/search?q=&problem=&topic=` | what long-term memory recalls for a moment (notes + similar past struggles, with scores) |
| `POST /vector/reindex` | rebuild the index from the JSON files |

Contract: [`shared/contract.ts`](shared/contract.ts) (copied byte-identical into `server/src` and `mobile/src`).

## Run

`server/.env` (never commit):
```
ANTHROPIC_API_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
```
Without `ANTHROPIC_API_KEY` (or with `MOCK=1`) the server runs in mock mode with canned responses.

`mobile/.env` (only for a phone):
```
EXPO_PUBLIC_API_URL=http://<laptop-LAN-IP>:8787
```

```bash
cd server && npm install && npm run seed && npm run dev
```

```bash
cd mobile && npm install && npx expo start
```

Sample inputs: `samples/textbook-fractions.pdf`, `samples/*.png`.

## Demo (3 min)

1. **Story:** 7:30 pm, a kid stuck on fractions, a parent who doesn't know the school's method.
2. **Upload** the chapter PDF → watch the agent read, plan, write and verify (live trace).
3. **Lesson:** short written lesson in the textbook's method → "Practice".
4. **Voice:** child answers wrong → "Nudge is thinking" shows recall → strategy → `FractionBars`
   → child taps, solves. "Just tell me!" → refused, rephrased.
5. **Finish:** the planner marks the lesson for review and creates a warm-up targeting
   "adds denominators" → home screen greets the child with it next time.
6. **Proof:** "What Nudge learned" — hints per problem going down over sessions.

## Later (only if the main demo works)

- Textbook retrieval through the same Qdrant index (lesson excerpts), a multilingual embedding model.
- Spaced repetition across days, teacher view.
