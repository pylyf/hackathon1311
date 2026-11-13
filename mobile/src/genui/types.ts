import type { UIEvent } from '../contract';

export interface GenUIProps<S> {
  spec: S;
  width: number;
  onEvent?: (e: UIEvent) => void;
}

// Web falls back to a serif font inside <svg>; use a friendly sans-serif there.
export const SVG_FONT: string | undefined =
  typeof document !== 'undefined' ? 'system-ui, -apple-system, Segoe UI, Arial, sans-serif' : undefined;
