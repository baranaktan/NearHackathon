import { QRCodeSVG } from 'qrcode.react';
import { cn } from '../lib/cn';

/**
 * QR code. Always dark-on-paper regardless of theme — scanners need contrast,
 * and the paper card reads like a ticket stub on the dark stage.
 */
export function QR({
  value,
  size = 184,
  caption,
  className,
  label = 'QR code',
}: {
  value: string;
  size?: number;
  caption?: string;
  className?: string;
  label?: string;
}) {
  return (
    <figure className={cn('inline-flex flex-col items-center gap-2.5', className)}>
      <div className="rounded-lg border border-[#d8ccb8] bg-[#f6f0e5] p-3 shadow-[0_1px_0_rgb(255_255_255/0.5)_inset]">
        <QRCodeSVG
          value={value}
          size={size}
          level="M"
          marginSize={0}
          bgColor="#f6f0e5"
          fgColor="#1b1512"
          role="img"
          aria-label={label}
          title={label}
          style={{ width: '100%', height: 'auto', maxWidth: size, display: 'block' }}
        />
      </div>
      {caption && <figcaption className="text-center text-[12px] text-fg-faint">{caption}</figcaption>}
    </figure>
  );
}
