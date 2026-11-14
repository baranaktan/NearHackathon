import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { cn } from '../lib/cn';
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-styles';
import { Spinner } from './Spinner';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  loading?: boolean;
  /** Text announced while loading, e.g. "Sending". */
  loadingLabel?: string;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, full, loading = false, loadingLabel, icon, iconRight, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses({ variant, size, full, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {/* Content keeps its width while loading so nothing shifts. */}
      <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>
        {icon}
        {children}
        {iconRight}
      </span>
      {loading && (
        <span className="absolute inset-0 inline-flex items-center justify-center gap-2">
          <Spinner />
          {loadingLabel && <span className="sr-only">{loadingLabel}</span>}
        </span>
      )}
    </button>
  );
});

type ButtonLinkProps = LinkProps & { variant?: ButtonVariant; size?: ButtonSize; full?: boolean; icon?: ReactNode; iconRight?: ReactNode };

export function ButtonLink({ variant, size, full, className, icon, iconRight, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, full, className: typeof className === 'string' ? className : undefined })} {...rest}>
      {icon}
      {children as ReactNode}
      {iconRight}
    </Link>
  );
}

type ExternalButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant; size?: ButtonSize; full?: boolean };

export function ButtonAnchor({ variant, size, full, className, children, ...rest }: ExternalButtonProps) {
  return (
    <a className={buttonClasses({ variant, size, full, className })} {...rest}>
      {children}
    </a>
  );
}
