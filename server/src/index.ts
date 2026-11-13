import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { CHILD_ID, ELEVEN_TTS_MODEL, HAS_ELEVEN, MOCK, MODEL_SOLVER, MODEL_TUTOR, PORT } from './config.js';
import type {
  CurriculumResponse, LessonProblemRequest, TextbookJobResponse, TextbookRequest,
  LearnedResponse, ProblemRequest, ProblemResponse, SessionEndRequest, SessionEndResponse,
  SessionStartResponse, TurnRequest, TurnResponse,
} from './contract.js';
import { loadBandit } from './bandit.js';
import { loadMemory } from './memory.js';
import { NotAProblemError, parseProblem } from './problem.js';
import { computeStats, reflect } from './reflect.js';
import { createSession, getOrCreateSession, getSession, persistSessions, type ProblemState } from './state.js';
import { ensureDataDir, logEvent } from './store.js';
import { flushPendingHints, introReply, lessonIntro, tutorTurn } from './tutor.js';
import { findLesson, jobStatus, loadCurriculum, markLessonStarted, markPracticeSolved, publicCurriculum, startTextbookJob, type StoredProblem } from './curriculum.js';
import { planNext } from './planner.js';
import { SttUnavailableError, synthesize, transcribe } from './voice.js';

ensureDataDir();
const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Handler = (req: Request, res: Response) => Promise<unknown>;
const route = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

app.get('/health', (_req, res) => {
  res.json({ ok: true, mock: MOCK, stt: HAS_ELEVEN, tts: HAS_ELEVEN });
});

app.post('/session/start', route(async (_req, res) => {
  const s = createSession(CHILD_ID);
  logEvent({ sessionId: s.id, type: 'session_start' });
  const body: SessionStartResponse = { sessionId: s.id };
  res.json(body);
}));

app.post('/problem', route(async (req, res) => {
  const { sessionId, imageBase64, mediaType } = (req.body ?? {}) as Partial<ProblemRequest>;
  if (!sessionId || !imageBase64) throw new HttpError(400, 'sessionId and imageBase64 are required');
  const mt = mediaType === 'image/png' ? 'image/png' : 'image/jpeg';
  const data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const session = getOrCreateSession(sessionId, CHILD_ID);

  let parsed;
  try {
    // relevant notes before the topic is known: interests only (topic='any' notes)
    parsed = await parseProblem(data, mt, loadMemory().filter((n) => n.kind === 'interest'));
  } catch (e) {
    if (e instanceof NotAProblemError) throw new HttpError(422, e.message);
    throw e;
  }
  const p: ProblemState = {
    id: randomUUID(),
    sessionId,
    text: parsed.text,
    topic: parsed.topic,
    question: parsed.question,
    quantities: parsed.quantities,
    answer: parsed.answer,
    starterVisual: parsed.starterVisual,
    level: 1, // start level per topic: default L1
    hintsGiven: 0,
    solved: false,
    history: [],
    pendingHints: [],
    createdAt: new Date().toISOString(),
  };
  session.problems[p.id] = p;
  logEvent({ sessionId, problemId: p.id, type: 'problem', topic: p.topic, text: p.text, verified: p.answer.verified });
  const intro = await introReply(p, parsed.introText);
  persistSessions();
  const body: ProblemResponse = { problemId: p.id, text: p.text, topic: p.topic, intro };
  res.json(body);
}));

// ---------- curriculum ----------

app.post('/textbook', route(async (req, res) => {
  const { fileBase64, mediaType, fileName } = (req.body ?? {}) as Partial<TextbookRequest>;
  if (!fileBase64) throw new HttpError(400, 'fileBase64 is required');
  const mt = mediaType === 'image/png' || mediaType === 'image/jpeg' ? mediaType : 'application/pdf';
  const body: TextbookJobResponse = { jobId: startTextbookJob({ fileBase64, mediaType: mt, fileName }) };
  res.json(body);
}));

app.get('/textbook/job/:jobId', (req, res) => {
  const st = jobStatus(String(req.params.jobId));
  if (!st) {
    res.status(404).json({ error: 'Unknown job (server restarted?) — upload again' });
    return;
  }
  res.json(st);
});

app.get('/curriculum', (_req, res) => {
  const body: CurriculumResponse = { curriculum: publicCurriculum(loadCurriculum()) };
  res.json(body);
});

app.post('/lesson/problem', route(async (req, res) => {
  const { sessionId, lessonId, problemId, warmup } = (req.body ?? {}) as Partial<LessonProblemRequest>;
  if (!sessionId || (!lessonId && !warmup)) throw new HttpError(400, 'sessionId and lessonId are required');
  const c = loadCurriculum();
  if (!c) throw new HttpError(404, 'No curriculum yet — upload a textbook chapter first');
  let src: StoredProblem | undefined;
  let lid: string;
  if (warmup) {
    if (!c.warmup) throw new HttpError(404, 'No warm-up planned yet');
    if (c.warmup.problem.solved) throw new HttpError(410, 'Warm-up already done');
    src = c.warmup.problem;
    lid = c.warmup.lessonId;
  } else {
    const lesson = findLesson(c, lessonId!);
    if (!lesson) throw new HttpError(404, `Unknown lesson ${lessonId}`);
    lid = lesson.id;
    if (problemId) {
      src = lesson.problems.find((x) => x.id === problemId);
      if (!src) throw new HttpError(404, `Unknown problem ${problemId} in lesson ${lid}`);
    } else {
      src = lesson.problems.find((x) => !x.solved);
      if (!src) throw new HttpError(410, 'Lesson done! All practice problems are solved.');
    }
  }
  const session = getOrCreateSession(sessionId, CHILD_ID);
  const p: ProblemState = {
    id: randomUUID(),
    sessionId,
    text: src.text,
    topic: src.topic,
    question: src.question,
    quantities: [],
    answer: { ...src.answer },
    starterVisual: src.starterVisual,
    level: 1,
    hintsGiven: 0,
    solved: false,
    history: [],
    pendingHints: [],
    createdAt: new Date().toISOString(),
    lessonId: lid,
    practiceId: src.id,
  };
  session.problems[p.id] = p;
  markLessonStarted(lid);
  logEvent({ sessionId, problemId: p.id, type: 'problem', topic: p.topic, text: p.text, verified: p.answer.verified, lessonId: lid, practiceId: src.id, warmup: !!warmup });
  const intro = await lessonIntro(p, warmup ? c.warmup?.message : undefined);
  persistSessions();
  const body: ProblemResponse = { problemId: p.id, lessonId: lid, text: p.text, topic: p.topic, intro };
  res.json(body);
}));

app.post('/turn', route(async (req, res) => {
  const { sessionId, problemId, audioBase64, audioMimeType, text, uiEvent } = (req.body ?? {}) as Partial<TurnRequest>;
  if (!sessionId || !problemId) throw new HttpError(400, 'sessionId and problemId are required');
  const p = getSession(sessionId)?.problems[problemId];
  if (!p) throw new HttpError(404, 'Unknown session or problem — start a session and send a photo first');

  let transcript = (text ?? '').trim();
  if (audioBase64 && !transcript) {
    try {
      transcript = await transcribe(audioBase64, audioMimeType);
    } catch (e) {
      if (e instanceof SttUnavailableError) throw new HttpError(400, e.message);
      throw e;
    }
    const bytes = Math.floor((audioBase64.length * 3) / 4);
    console.log(`[stt] ${bytes} bytes ${audioMimeType ?? '?'} → "${transcript}"`);
    // Audio arrived but nothing was understood (silence, too short, mic muted):
    // ask the child to repeat instead of failing. Does not count as an attempt.
    if (!transcript && !uiEvent) {
      const sayAgain = "Hmm, I couldn't hear you. Can you say it again, a little louder?";
      const body: TurnResponse = {
        transcript: '',
        reply: { text: sayAgain, audioBase64: await synthesize(sayAgain), ui: null, hint: null },
        solved: p.solved,
      };
      res.json(body);
      return;
    }
  }
  if (!transcript && !uiEvent) throw new HttpError(400, 'Send text, audio or a uiEvent');

  const result = await tutorTurn(p, transcript, uiEvent);
  if (result.solved && p.practiceId) markPracticeSolved(p.practiceId);
  persistSessions();
  const body: TurnResponse = { transcript, reply: result.reply, solved: result.solved };
  res.json(body);
}));

app.post('/session/end', route(async (req, res) => {
  const { sessionId } = (req.body ?? {}) as Partial<SessionEndRequest>;
  if (!sessionId) throw new HttpError(400, 'sessionId is required');
  const s = getSession(sessionId);
  if (!s) throw new HttpError(404, 'Unknown session');
  if (s.ended) {
    const body: SessionEndResponse = { notes: s.endNotes ?? [], ...(s.endPlan ? { plan: s.endPlan } : {}) };
    res.json(body);
    return;
  }
  for (const p of Object.values(s.problems)) flushPendingHints(p);
  const notes = await reflect(sessionId);
  let plan: SessionEndResponse['plan'];
  try {
    plan = await planNext(sessionId);
  } catch (e) {
    console.error('[planner] failed', e);
  }
  s.ended = true;
  s.endNotes = notes;
  s.endPlan = plan;
  logEvent({ sessionId, type: 'session_end', notes: notes.length });
  persistSessions();
  const body: SessionEndResponse = { notes, ...(plan ? { plan } : {}) };
  res.json(body);
}));

app.get('/learned', (_req, res) => {
  const body: LearnedResponse = { bandit: loadBandit(), memory: loadMemory(), stats: computeStats() };
  res.json(body);
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof Error ? err.message : String(err);
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Nudge server on http://0.0.0.0:${PORT}`);
  console.log(
    MOCK
      ? '  Claude: MOCK mode (no ANTHROPIC_API_KEY or MOCK=1) — canned responses, bandit/memory/events still update'
      : `  Claude: LIVE (solver ${MODEL_SOLVER}, tutor ${MODEL_TUTOR})`,
  );
  console.log(HAS_ELEVEN ? `  ElevenLabs: LIVE (STT scribe, TTS ${ELEVEN_TTS_MODEL})` : '  ElevenLabs: off (no ELEVENLABS_API_KEY) — STT unavailable (send text), TTS returns null');
});
