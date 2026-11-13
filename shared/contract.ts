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

// ---------- Tutor reply ----------

export interface TutorReply {
  text: string;               // what the tutor says (also shown as subtitle)
  audioBase64: string | null; // mp3, null if TTS unavailable (mobile then uses expo-speech)
  ui: UISpec | null;          // component to show (replaces the previous one), null = keep current
  hint: { level: HintLevel; style: HintStyle } | null;
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
export interface SessionEndResponse { notes: MemoryNote[] }

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
