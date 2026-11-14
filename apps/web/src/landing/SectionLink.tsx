import type { AnchorHTMLAttributes } from 'react';

/**
 * In-page anchor that works under HashRouter (a plain "#id" href would be read
 * as a route). Scrolls and moves focus to the target section.
 */
export function SectionLink({ target, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { target: string }) {
  return (
    <a
      href={`#/`}
      onClick={(e) => {
        onClick?.(e);
        e.preventDefault();
        const el = document.getElementById(target);
        if (!el) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        el.focus({ preventScroll: true });
      }}
      {...rest}
    />
  );
}
