/**
 * PREVIEW ONLY — delete this folder when the hooks are wired to @perde/core.
 *
 * Every page can be rendered in each UI state by adding `?state=<name>` to the
 * route, e.g. `#/app/inbox?state=empty`. Hooks read it through
 * `usePreviewState` and return the matching fixture.
 */
import { useSearchParams } from 'react-router';

export const PREVIEW_STATES = {
  '/app/receive': ['none', 'created', 'ready', 'registered', 'loading', 'error'],
  '/app/send': ['edit', 'review', 'submitting', 'success', 'error', 'no-sender'],
  '/app/inbox': ['found', 'scanning', 'empty', 'error', 'no-identity'],
  '/app/invoice': ['open', 'paid', 'quote-loading', 'quote-error', 'empty', 'no-identity'],
  '/app/payroll': ['input', 'review', 'submitting', 'done', 'error', 'empty'],
  '/app/audit': ['idle', 'scanning', 'done', 'empty', 'error'],
  '/app/verify': ['idle', 'verifying', 'verified', 'failed', 'invalid'],
  '/app/settings': ['ready', 'missing', 'funding', 'error'],
} as const;

export type PreviewRoute = keyof typeof PREVIEW_STATES;
export type PreviewStateOf<R extends PreviewRoute> = (typeof PREVIEW_STATES)[R][number];

export function usePreviewState<R extends PreviewRoute>(route: R): PreviewStateOf<R> {
  const [params] = useSearchParams();
  const states = PREVIEW_STATES[route] as readonly string[];
  const requested = params.get('state');
  return (requested && states.includes(requested) ? requested : states[0]) as PreviewStateOf<R>;
}

/** Resolve after a short delay so loading states are visible in preview. */
export const previewDelay = (ms = 900) => new Promise<void>((r) => window.setTimeout(r, ms));
