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

Out of scope: accounts, auth, deploy, databases. One hard-coded child (`demo`).

## Stack

- **App:** Expo (React Native, TypeScript) — Expo Go on a phone or the browser
- **Server:** Node + Express (TypeScript) on the laptop
- **Services:** Anthropic API + ElevenLabs — nothing else
- **Storage:** local JSON files in `server/data/`

```
Expo app ──HTTP──► Express server ──► Anthropic: Opus (textbook, photo, planner), Sonnet (tutor loop)
                                  └─► ElevenLabs (STT, TTS)
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

- **Embeddings + Qdrant** for memory and textbook retrieval (local model `all-MiniLM-L6-v2`,
  `docker run -p 6333:6333 qdrant/qdrant`, `MEMORY_BACKEND=qdrant`); JSON files stay the default.
- Spaced repetition across days, teacher view.
