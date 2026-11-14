import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../lib/cn';
import { controlClasses as control } from './control-styles';

export interface FieldRenderProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': boolean | undefined;
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Optional element on the label row's right (e.g. "Balance 12 NEAR"). */
  aside?: ReactNode;
  optional?: boolean;
  className?: string;
  children: (props: FieldRenderProps) => ReactNode;
}

/** Label + control + hint/error, wired with ids for assistive tech. */
export function Field({ label, hint, error, aside, optional, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <div className="flex min-h-5 items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium tracking-[0.01em] text-fg">
          {label}
          {optional && <span className="ml-1.5 font-normal text-fg-faint">optional</span>}
        </label>
        {aside && <div className="text-[13px] text-fg-muted">{aside}</div>}
      </div>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-[13px] leading-snug text-danger" role="alert">
          <AlertCircle aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-[13px] leading-snug text-fg-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}


export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }>(
  function Input({ className, mono, ...rest }, ref) {
    return <input ref={ref} className={cn(control, 'h-11 px-3.5 text-[15px]', mono && 'font-mono text-[14px]', className)} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }>(
  function Textarea({ className, mono, rows = 4, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(control, 'resize-y px-3.5 py-3 text-[15px] leading-relaxed', mono && 'font-mono text-[13px]', className)}
        {...rest}
      />
    );
  },
);

