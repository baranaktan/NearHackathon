import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium tracking-[-0.005em] ' +
  'transition-[background-color,color,border-color,box-shadow,transform] duration-150 ease-out ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 ' +
  // extend the hit area of compact buttons to 44px without changing layout
  'after:absolute after:-inset-y-1 after:inset-x-0 after:content-[""]';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-on-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(0_0_0/0.3)] hover:bg-accent-hover',
  secondary: 'border border-line-strong bg-surface-2 text-fg hover:border-fg-faint hover:bg-surface-3',
  ghost: 'text-fg-muted hover:bg-surface-2 hover:text-fg',
  danger: 'border border-danger/50 bg-transparent text-danger hover:bg-danger/10',
  quiet: 'px-0! text-fg underline decoration-line-strong underline-offset-4 hover:decoration-brass',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 rounded-md px-3 text-[13px]',
  md: 'h-11 rounded-md px-4.5 text-[15px]',
  lg: 'h-13 rounded-lg px-6 text-base',
};

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  full = false,
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; full?: boolean; className?: string } = {}): string {
  return cn(base, variants[variant], sizes[size], full && 'w-full', className);
}
