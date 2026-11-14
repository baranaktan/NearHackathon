import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { Callout } from './Feedback';
import { Button } from './Button';

/**
 * Catches a page that fails to load or render (typically a lazy route chunk
 * that could not be fetched: flaky network, or a tab left open across a
 * redeploy) and offers a reload, instead of unmounting the whole app into a
 * blank screen. Reset by changing `resetKey` (the route).
 */
export class RouteErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null; key: string | undefined }> {
  state: { error: Error | null; key: string | undefined } = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: { resetKey?: string }, state: { error: Error | null; key: string | undefined }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept for whoever opens the console; the page shows a plain-language message.
    console.info('[perde] page failed to load', error.message, info.componentStack?.split('\n')[1]?.trim());
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = /module script|dynamically imported module|Loading chunk|Failed to fetch|import/i.test(this.state.error.message);
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <Callout
          tone="danger"
          role="alert"
          title="This page couldn’t load"
          action={
            <Button variant="secondary" size="sm" icon={<RotateCcw aria-hidden className="size-4" />} onClick={() => window.location.reload()}>
              Reload
            </Button>
          }
        >
          {chunk
            ? 'Part of the app didn’t download — the connection dropped, or a newer version was published. Reloading fixes it; your keys and history stay in this browser.'
            : 'Something went wrong while showing this page. Reloading usually fixes it; your keys and history stay in this browser.'}
        </Callout>
      </div>
    );
  }
}
