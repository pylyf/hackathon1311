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

export interface PictureSpec {
  type: 'Picture';
  caption?: string;
  items: { emoji: string; label?: string; count?: number }[]; // a little illustrated scene, e.g. 👧 + 🎂 + 👫
}
export interface StepsSpec {
  type: 'Steps';
  caption?: string;
  steps: string[];   // the method, in order (2-5 short steps)
  current?: number;  // 0-based step the child is on (highlighted)
}
export interface BalanceSpec {
  type: 'Balance';
  caption?: string;
  left: { label: string; emoji?: string };
  right: { label: string; emoji?: string };
  tilt: 'left' | 'right' | 'even' | 'unknown'; // which side is heavier; "unknown" = the question
}
export interface MoneySpec {
  type: 'Money';
  caption?: string;
  currency: '€' | '$' | '£';
  coins: { value: number; count: number }[]; // value in cents/pence (e.g. 50) or whole units for notes (>=500)
}
export interface ShapeSpec {
  type: 'Shape';
  caption?: string;
  shape: 'square' | 'rectangle' | 'triangle';
  sides: string[];  // labels per side, e.g. ["5 cm","3 cm","?","3 cm"]
  grid?: boolean;   // draw unit squares inside (area)
  cols?: number;    // grid columns (rectangle/square)
  rows?: number;    // grid rows
}
export interface TallySpec {
  type: 'Tally';
  caption?: string;
  rows: { label: string; emoji?: string; count: number; unknown?: boolean }[];
}

/** Optional emphasis Claude can put on any block. */
export interface BlockStyle {
  focus?: boolean; // ring + gentle pulse: "look here"
}

export type BlockSpec = (
  | FractionBarsSpec | NumberLineSpec | BarModelSpec | UnitLadderSpec
  | FractionPieSpec | CountersSpec | ArrayGridSpec | BarChartSpec | PlaceValueSpec
  | RulerSpec | ClockSpec | EquationSpec | CompareSpec | ChoiceSpec | SliderSpec | CalloutSpec
  | PictureSpec | StepsSpec | BalanceSpec | MoneySpec | ShapeSpec | TallySpec
) & BlockStyle;

export type SceneTheme = 'orange' | 'blue' | 'green' | 'purple' | 'yellow' | 'pink';

/** A short animated explanation: steps appear one at a time, each with 1-2 blocks and a spoken line. */
export interface SceneStep {
  say?: string;               // **words** in double stars are highlighted in the theme colour
  blocks: BlockSpec[];
  layout?: 'stack' | 'row';   // row = two blocks side by side (for comparing)
}
export interface SceneSpec {
  type: 'Scene';
  title?: string;
  theme?: SceneTheme;         // accent colour that fits the story (pizza -> orange, sea -> blue …)
  art?: string;               // 1-3 emoji shown as the scene's header illustration
  steps: SceneStep[];         // 1-3 steps
}

export type UISpec = BlockSpec | SceneSpec;

// Sent by mobile when the child interacts with a component.
export interface UIEvent {
  component: string; // block type, e.g. "FractionPie"
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
  imageBase64?: string;           // a photo of the homework…
  mediaType?: 'image/jpeg' | 'image/png';
  exampleText?: string;           // …or the text of a built-in example problem
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
  progress?: boolean; // the child got a step right (not the final answer yet) -> celebrate a little
}

// POST /session/end
export interface SessionEndRequest { sessionId: string }
export interface SessionEndResponse {
  notes: MemoryNote[];
  changes?: BrainChange[];     // how the agent rewrote its own skills / recipes
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
