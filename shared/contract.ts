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

// ----- extra building blocks (used inside a Scene) -----

export interface FractionPieSpec {
  type: 'FractionPie';
  caption?: string;
  pies: { parts: number; shaded: number; label?: string }[]; // 1-4 pies
  interactive: boolean; // tap slices to shade
}
export interface CountersSpec {
  type: 'Counters';
  caption?: string;
  groups: { emoji: string; count: number; label?: string }[]; // emoji objects in groups
  crossOut?: number;     // how many of the LAST group are crossed out (taken away)
  interactive: boolean;  // tap objects to count / cross out
}
export interface ArrayGridSpec {
  type: 'ArrayGrid';
  caption?: string;
  rows: number;
  cols: number;
  emoji?: string;        // default a dot
  interactive: boolean;  // tap rows to count them
}
export interface BarChartSpec {
  type: 'BarChart';
  caption?: string;
  bars: { label: string; value: number; emoji?: string; unknown?: boolean }[];
  unit?: string;
}
export interface PlaceValueSpec {
  type: 'PlaceValue';
  caption?: string;
  number: number; // 0-9999, shown as thousands/hundreds/tens/ones blocks
}
export interface RulerSpec {
  type: 'Ruler';
  caption?: string;
  max: number;     // e.g. 10
  unit: string;    // e.g. "cm"
  marks?: { value: number; label?: string }[];
  interactive: boolean; // drag/tap to measure
}
export interface ClockSpec {
  type: 'Clock';
  caption?: string;
  hour: number;    // 0-23
  minute: number;  // 0-59
}
export interface EquationSpec {
  type: 'Equation';
  caption?: string;
  lines: string[]; // e.g. ["40 - 23 = 17", "17 - 8 = ?"]; "?" or "□" renders as an empty box
}
export interface CompareSpec {
  type: 'Compare';
  caption?: string;
  left: string;    // e.g. "3/4"
  right: string;   // e.g. "2/3"
  leftEmoji?: string;
  rightEmoji?: string;
}
export interface ChoiceSpec {
  type: 'Choice';
  question: string;
  options: string[]; // 2-4 options; the child taps one (it is sent as a turn)
}
export interface SliderSpec {
  type: 'Slider';
  caption?: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  emoji?: string; // shown on the thumb
}
export interface CalloutSpec {
  type: 'Callout';
  emoji: string;
  text: string;    // one short idea, max ~15 words
  tone?: 'idea' | 'tip' | 'wow' | 'remember';
}

export type BlockSpec =
  | FractionBarsSpec | NumberLineSpec | BarModelSpec | UnitLadderSpec
  | FractionPieSpec | CountersSpec | ArrayGridSpec | BarChartSpec | PlaceValueSpec
  | RulerSpec | ClockSpec | EquationSpec | CompareSpec | ChoiceSpec | SliderSpec | CalloutSpec;

/** A short animated explanation: steps appear one at a time, each with 1-2 blocks and a spoken line. */
export interface SceneSpec {
  type: 'Scene';
  title?: string;
  steps: { say?: string; blocks: BlockSpec[] }[]; // 1-5 steps
}

export type UISpec = BlockSpec | SceneSpec;

// Sent by mobile when the child interacts with a component.
export interface UIEvent {
  component: string; // block type, e.g. "FractionPie"
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
  imageBase64?: string;           // a photo of the homework…
  mediaType?: 'image/jpeg' | 'image/png';
  exampleText?: string;           // …or the text of a built-in example problem
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
export interface SessionEndResponse { notes: MemoryNote[]; changes?: BrainChange[] }

// GET /learned
export interface LearnedResponse {
  bandit: BanditState;
  memory: MemoryNote[];
  stats: { sessions: number; problemsSolved: number; avgHintsPerSolved: number[] }; // per session, oldest first
}

// GET /profile -> ProfileResponse (profile null = show onboarding)
// POST /profile  body: ChildProfile -> ProfileResponse
export interface ChildProfile {
  name: string;
  grade: number | null;          // 1-5, null = not sure
  interests: string[];           // e.g. ["football", "dinosaurs"] — become memory notes
  mathFeeling: 'love' | 'ok' | 'tricky' | null;
  dailyGoal: number | null;      // problems per day
}
export interface ProfileResponse { profile: ChildProfile | null }

// GET /progress — gamification (all derived from the event log)
export interface Badge {
  id: string;
  title: string;
  description: string;
  icon: string;      // emoji
  color: string;     // hex
  earned: boolean;
  progress: number;  // 0..1 toward earning it
}
export interface TopicProgress {
  topic: Topic;
  solved: number;
  level: number;      // 1..5 (crown level)
  levelProgress: number; // 0..1 inside the current level
}
export interface ProgressResponse {
  pebbles: number;          // XP — the otter collects pebbles
  level: number;
  levelPebbles: number;     // pebbles inside current level
  nextLevelPebbles: number; // pebbles needed for the next level
  streak: number;           // days in a row with >=1 solve
  todaySolved: number;
  dailyGoal: number;
  week: { day: string; done: boolean; today: boolean }[]; // last 7 days, oldest first
  totalSolved: number;
  noHintSolves: number;
  topics: TopicProgress[];
  badges: Badge[];
  lastSolve: { pebbles: number; hints: number; topic: Topic } | null;
}

// ---------- Agent self-improvement (GET /brain) ----------

/** A teaching playbook the agent wrote for itself about this child. */
export interface Skill {
  id: string;             // kebab-case
  title: string;
  topic: Topic | 'any';
  whenToUse: string;      // one line
  body: string;           // markdown-ish playbook, short
  version: number;
  updatedAt: string;
}
/** A reusable visual the agent invented and saved. */
export interface Recipe {
  id: string;
  title: string;
  topic: Topic | 'any';
  whenToUse: string;
  scene: SceneSpec;
  uses: number;
  updatedAt: string;
}
export interface BrainChange {
  ts: string;
  kind: 'skill-created' | 'skill-updated' | 'recipe-created' | 'note';
  title: string;
  why: string;
}
export interface BrainResponse {
  skills: Skill[];
  recipes: Recipe[];
  changes: BrainChange[]; // newest first
}

// GET /problem/:id/scene — the "Show me" explainer prepared ahead of time
export interface PreparedSceneResponse { scene: SceneSpec | null; ready: boolean }

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
