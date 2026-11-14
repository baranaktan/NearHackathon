import { useId } from 'react';
import { buildDrape } from './drape-geometry';
import { cn } from '../lib/cn';

const GEOMETRY = buildDrape();

/**
 * A gathered stage drape (left side; pass `side="right"` to mirror).
 * Pure SVG, no filters; colours come from the velvet tokens.
 */
export function Drape({ side = 'left', className }: { side?: 'left' | 'right'; className?: string }) {
  const id = useId().replace(/:/g, '');
  const { width, height, lit, shade, ridges, tieY, tieWidth } = GEOMETRY;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn('block h-full w-full', side === 'right' && '-scale-x-100', className)}
    >
      <defs>
        <linearGradient id={`${id}-lit`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--velvet-mid)" />
          <stop offset="0.35" stopColor="var(--velvet-light)" />
          <stop offset="0.62" stopColor="var(--velvet-mid)" />
          <stop offset="0.8" stopColor="var(--velvet-light)" />
          <stop offset="1" stopColor="var(--velvet-shadow)" />
        </linearGradient>
        <linearGradient id={`${id}-shade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--velvet-deep)" />
          <stop offset="0.4" stopColor="var(--velvet-shadow)" />
          <stop offset="0.62" stopColor="var(--velvet-deep)" />
          <stop offset="0.85" stopColor="var(--velvet-shadow)" />
          <stop offset="1" stopColor="var(--velvet-deep)" />
        </linearGradient>
        <linearGradient id={`${id}-fall`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="0.8" stopColor="#000" stopOpacity="0.08" />
          <stop offset="1" stopColor="#000" stopOpacity="0.38" />
        </linearGradient>
      </defs>
      <g>
        {shade.map((d, i) => (
          <path key={`s${i}`} d={d} fill={`url(#${id}-shade)`} />
        ))}
        {lit.map((d, i) => (
          <path key={`l${i}`} d={d} fill={`url(#${id}-lit)`} />
        ))}
        {ridges.map((d, i) => (
          <path
            key={`r${i}`}
            d={d}
            fill="none"
            stroke="var(--velvet-sheen)"
            strokeOpacity="0.55"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <rect width={width} height={height} fill={`url(#${id}-fall)`} />
      </g>
      {/* Tieback: a brass cord wrapped around the gathered fabric. */}
      <path
        d={`M-4 ${tieY - 14}C${tieWidth * 0.4} ${tieY + 16} ${tieWidth * 0.85} ${tieY + 14} ${tieWidth + 12} ${tieY - 8}`}
        fill="none"
        stroke="var(--brass)"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
      <circle cx={tieWidth + 12} cy={tieY - 8} r="5" fill="var(--brass)" />
    </svg>
  );
}
