import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { Logo } from '../brand/Logo';
import { ButtonLink } from '../ui/Button';
import { ThemeToggle } from '../components/ThemeToggle';
import { SectionLink } from './SectionLink';

const links = [
  { target: 'how', label: 'How it works' },
  { target: 'why-near', label: 'Why NEAR' },
  { target: 'use-cases', label: 'Use cases' },
  { target: 'privacy', label: 'What’s private' },
];

export function SiteHeader() {
  return (
    <header className="relative z-30">
      <div className="mx-auto flex h-18 max-w-[1240px] items-center justify-between gap-4 px-6 sm:px-10">
        <Link to="/" className="rounded-md text-fg" aria-label="Perde home">
          <Logo size={26} accentMark />
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <SectionLink key={l.target} target={l.target} className="text-[14px] text-fg-muted transition-colors hover:text-fg">
              {l.label}
            </SectionLink>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <ButtonLink to="/app" variant="secondary" size="sm" iconRight={<ArrowRight aria-hidden className="size-3.5" />}>
            Open app
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
