import type {
  CurriculumResponse,
  LearnedResponse,
  LessonProblemRequest,
  ProblemRequest,
  ProblemResponse,
  SessionEndResponse,
  SessionStartResponse,
  TurnRequest,
  TextbookJobResponse,
  TextbookJobStatus,
  TextbookRequest,
  TurnResponse,
} from './contract';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8787').replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs = 60000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      controller.signal.aborted
        ? 'Nudge is taking too long to answer.'
        : `Can't reach Nudge's brain at ${API_URL}. Is the server running?`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.error || j?.message || '';
    } catch {
      /* ignore */
    }
    throw new ApiError(`Oops, something went wrong (${res.status})${detail ? `: ${detail}` : ''}.`, res.status);
  }
  return (await res.json()) as T;
}

export const api = {
  startSession: () => request<SessionStartResponse>('POST', '/session/start', {}),
  problem: (req: ProblemRequest) => request<ProblemResponse>('POST', '/problem', req, 90000),
  turn: (req: TurnRequest) => request<TurnResponse>('POST', '/turn', req, 90000),
  endSession: (sessionId: string) => request<SessionEndResponse>('POST', '/session/end', { sessionId }, 90000),
  learned: () => request<LearnedResponse>('GET', '/learned'),
  curriculum: () => request<CurriculumResponse>('GET', '/curriculum', undefined, 15000),
  textbook: (req: TextbookRequest) => request<TextbookJobResponse>('POST', '/textbook', req, 120000),
  textbookJob: (jobId: string) => request<TextbookJobStatus>('GET', `/textbook/job/${encodeURIComponent(jobId)}`, undefined, 20000),
  lessonProblem: (req: LessonProblemRequest) => request<ProblemResponse>('POST', '/lesson/problem', req, 90000),
};

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
