// Shared API contract between server/ and mobile/.
// Both projects keep a byte-identical copy of this file:
//   server/src/contract.ts  and  mobile/src/contract.ts
// Change it here first, then copy.

export type Topic = 'word-problems' | 'fractions' | 'units';
export type HintStyle = 'verbal' | 'visual' | 'story' | 'smaller-numbers';
export type HintLevel = 1 | 2 | 3 | 4 | 5;

// ---------- GenUI specs (rendered by mobile/src/genui/*) ----------

export interface FractionBarsSpec {
  type: 'FractionBars';
  caption?: string;
  rows: { denominator: number; shaded: number; label?: string }[];
  interactive: boolean; // child can tap segments to shade/unshade
}

export interface NumberLineSpec {
  type: 'NumberLine';
  caption?: string;
  min: number;
  max: number;
  step: number;
  marks?: { value: number; label?: string }[];
  jumps?: { from: number; to: number; label?: string }[];
  interactive: boolean; // child can drag a marker
}

export interface BarModelSpec {
  type: 'BarModel';
  caption?: string;
  mode: 'part-whole' | 'compare';
  bars: {
    label: string;
    parts: { label?: string; value?: number; unknown?: boolean }[];
  }[];
}

export interface UnitLadderSpec {
  type: 'UnitLadder';
  caption?: string;
  units: string[];   // largest -> smallest, e.g. ["km","m","cm","mm"]
  factors: number[]; // factors[i] converts units[i] -> units[i+1], e.g. [1000,100,10]
  value?: number;
  fromUnit?: string;
  interactive: boolean; // child can move the value up/down the ladder
}

export type UISpec = FractionBarsSpec | NumberLineSpec | BarModelSpec | UnitLadderSpec;

// Sent by mobile when the child interacts with a component.
export interface UIEvent {
  component: UISpec['type'];
  action: string; // e.g. "shade", "move_marker", "convert", "tap_bar"
  data: Record<string, unknown>; // e.g. { row: 0, shaded: 2, of: 4 }
}

// ---------- Agent trace (shown in the "Nudge is thinking" panel) ----------

export interface TraceStep {
  kind: 'read' | 'plan' | 'recall' | 'strategy' | 'override' | 'draw' | 'check' | 'memory' | 'generate' | 'verify' | 'speak';
  text: string; // short, human-readable, e.g. "Recalled: adds denominators"
}

// ---------- Tutor reply ----------

export interface TutorReply {
  text: string;               // what the tutor says (also shown as subtitle)
  audioBase64: string | null; // mp3, null if TTS unavailable (mobile then uses expo-speech)
  ui: UISpec | null;          // component to show (replaces the previous one), null = keep current
  hint: { level: HintLevel; style: HintStyle } | null;
  trace?: TraceStep[];        // what the agent did this turn, in order
}

// ---------- Curriculum (built by the agent from a textbook chapter) ----------

export interface PracticeProblem {
  id: string;
  text: string;          // problem statement for the child (answer is kept server-side)
  topic: Topic;
  skill: string;         // e.g. "add fractions with the same denominator"
  difficulty: 1 | 2 | 3;
}

export type LessonStatus = 'locked' | 'ready' | 'in-progress' | 'review' | 'mastered';

export interface Lesson {
  id: string;
  title: string;          // e.g. "Adding fractions with the same bottom number"
  topic: Topic;
  skill: string;
  summary: string;        // one sentence
  explanation: string;    // short kid-friendly written lesson; paragraphs separated by \n\n
  workedExample: string;  // one worked example, steps separated by \n
  methodNote: string;     // how the textbook teaches it (tutor must use the same method)
  sourcePages?: string;   // e.g. "p. 2, section 5.3"
  visual?: UISpec;        // optional illustration for the written lesson
  problems: PracticeProblem[];
  status: LessonStatus;
  mastery: number;        // 0..1
}

export interface WarmUp {
  message: string;        // e.g. "Last time adding fractions was tricky. Quick warm-up?"
  lessonId: string;
  problem: PracticeProblem;
}

export interface Curriculum {
  id: string;
  title: string;          // e.g. "Chapter 5 · Fractions"
  source: string;         // uploaded file name
  createdAt: string;
  lessons: Lesson[];
  nextLessonId: string | null;
  warmup: WarmUp | null;
}

// POST /textbook — starts an async agent job (building takes a while)
export interface TextbookRequest {
  fileBase64: string;
  mediaType: 'application/pdf' | 'image/jpeg' | 'image/png';
  fileName?: string;
}
export interface TextbookJobResponse { jobId: string }

// GET /textbook/job/:jobId — poll every ~1.5 s
export interface TextbookJobStatus {
  status: 'running' | 'done' | 'error';
  steps: TraceStep[];          // live progress of the agent
  curriculum?: Curriculum;     // when done
  error?: string;
}

// GET /curriculum
export interface CurriculumResponse { curriculum: Curriculum | null }

// POST /lesson/problem — start a practice problem from the curriculum (no photo)
// Returns ProblemResponse. Omit problemId to get the next unsolved problem of the lesson.
export interface LessonProblemRequest {
  sessionId: string;
  lessonId: string;
  problemId?: string;
  warmup?: boolean;            // start the curriculum's warm-up problem instead
}

// ---------- Endpoints ----------

// POST /session/start
export interface SessionStartResponse { sessionId: string }

// POST /problem
export interface ProblemRequest {
  sessionId: string;
  imageBase64: string;
  mediaType: 'image/jpeg' | 'image/png';
}
export interface ProblemResponse {
  problemId: string;
  lessonId?: string;   // set when the problem comes from the curriculum
  text: string;   // problem as read from the photo
  topic: Topic;
  intro: TutorReply; // tutor explains the problem and asks a first (L1) question
}

// POST /turn  — send audio OR text (text = keyboard fallback), optionally a UI event
export interface TurnRequest {
  sessionId: string;
  problemId: string;
  audioBase64?: string;
  audioMimeType?: string; // e.g. "audio/m4a", "audio/webm"
  text?: string;
  uiEvent?: UIEvent;
}
export interface TurnResponse {
  transcript: string; // what the child said (from STT, or the text sent)
  reply: TutorReply;
  solved: boolean;
}

// POST /session/end
export interface SessionEndRequest { sessionId: string }
export interface SessionEndResponse {
  notes: MemoryNote[];
  plan?: {                     // what the planner agent changed for next time
    changes: string[];         // e.g. "Lesson 3 → review", "New warm-up: 2/7 + 3/7"
    trace: TraceStep[];
    nextLessonId: string | null;
    warmup: WarmUp | null;
  };
}

// GET /learned
export interface LearnedResponse {
  bandit: BanditState;
  memory: MemoryNote[];
  stats: { sessions: number; problemsSolved: number; avgHintsPerSolved: number[] }; // per session, oldest first
}

// ---------- Learning state ----------

export type BanditState = Record<Topic, Record<HintStyle, [number, number]>>; // [alpha, beta]

export interface MemoryNote {
  id: string;
  topic: Topic | 'any';
  kind: 'misconception' | 'works' | 'doesnt-work' | 'interest' | 'mastered';
  text: string;
  seen: number;
  updatedAt: string; // ISO
}
