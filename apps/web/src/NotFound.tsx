import { ArrowLeft } from 'lucide-react';
import { ButtonLink } from './ui/Button';
import { EmptyState } from './ui/Feedback';

export default function NotFound({ inApp = false }: { inApp?: boolean }) {
  return (
    <div className={inApp ? '' : 'flex min-h-dvh items-center justify-center bg-bg px-6'}>
      <EmptyState
        title="Nothing on this stage"
        action={
          <ButtonLink to={inApp ? '/app' : '/'} variant="secondary" icon={<ArrowLeft aria-hidden className="size-4" />}>
            {inApp ? 'Back to the app' : 'Back to Perde'}
          </ButtonLink>
        }
      >
        This page doesn&rsquo;t exist.
      </EmptyState>
    </div>
  );
}
