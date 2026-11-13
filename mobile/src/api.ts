import type {
  BrainResponse,
  ChildProfile,
  PreparedSceneResponse,
  ProfileResponse,
  ProgressResponse,
  LearnedResponse,
  ProblemRequest,
  ProblemResponse,
  SessionEndResponse,
  SessionStartResponse,
  TurnRequest,
  TurnResponse,
} from './contract';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8787').replace(/\/+$/, '');

export class ApiError extends Error {}

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
    throw new ApiError(`Oops, something went wrong (${res.status})${detail ? `: ${detail}` : ''}.`);
  }
  return (await res.json()) as T;
}

export const api = {
  startSession: () => request<SessionStartResponse>('POST', '/session/start', {}),
  problem: (req: ProblemRequest) => request<ProblemResponse>('POST', '/problem', req, 90000),
  turn: (req: TurnRequest) => request<TurnResponse>('POST', '/turn', req, 90000),
  endSession: (sessionId: string) => request<SessionEndResponse>('POST', '/session/end', { sessionId }, 90000),
  brain: () => request<BrainResponse>('GET', '/brain'),
  preparedScene: (problemId: string) => request<PreparedSceneResponse>('GET', `/problem/${problemId}/scene`, undefined, 35000),
  tts: (text: string) => request<{ audioBase64: string | null }>('POST', '/tts', { text }, 20000),
  progress: () => request<ProgressResponse>('GET', '/progress', undefined, 8000),
  learned: () => request<LearnedResponse>('GET', '/learned'),
  profile: () => request<ProfileResponse>('GET', '/profile', undefined, 8000),
  saveProfile: (p: ChildProfile) => request<ProfileResponse>('POST', '/profile', p),
};

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
