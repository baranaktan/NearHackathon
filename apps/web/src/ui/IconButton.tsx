import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  icon: ReactNode;
  size?: 'sm' | 'md';
  tone?: 'default' | 'onVelvet';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = 'md', tone = 'default', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-md transition-colors duration-150',
        'after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-1/2 after:content-[""]',
        size === 'md' ? 'size-11' : 'size-8',
        tone === 'default'
          ? 'text-fg-muted hover:bg-surface-2 hover:text-fg'
          : 'text-[#f3ede2]/80 hover:bg-white/10 hover:text-[#f3ede2]',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
});
