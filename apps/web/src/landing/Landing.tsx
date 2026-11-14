import { useEffect } from 'react';
import { SiteHeader } from './SiteHeader';
import { Hero } from './Hero';
import { ClosingCta, HowItWorks, PrivacyHonest, SiteFooter, WhyNear } from './Sections';

export default function Landing() {
  useEffect(() => {
    document.title = 'Perde — private payments on NEAR';
  }, []);
  return (
    <div className="grain min-h-dvh overflow-x-clip">
      <a href="#/" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }} className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2">
        Skip to content
      </a>
      <div className="relative">
        <SiteHeader />
      </div>
      <main id="main" tabIndex={-1} className="relative z-[1] outline-none">
        <Hero />
        <HowItWorks />
        <WhyNear />
        <PrivacyHonest />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}
