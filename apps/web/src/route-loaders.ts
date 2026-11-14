/**
 * Lazy route chunks that are worth fetching before they are needed. The
 * guided demo is where the landing page's main call to action leads, so the
 * landing starts loading it as soon as a visitor reaches for that link.
 */
let guidedDemo: ReturnType<typeof importGuidedDemo> | null = null;
const importGuidedDemo = () => import('./features/demo/GuidedDemoPage');

export function loadGuidedDemo(): ReturnType<typeof importGuidedDemo> {
  guidedDemo ??= importGuidedDemo().catch((e: unknown) => {
    guidedDemo = null; // let a later attempt retry the download
    throw e;
  });
  return guidedDemo;
}

/**
 * Start the download on intent: pointer over, focus or touch of a link into
 * the app. (Not on idle: evaluating the chunk early costs ~0.4 s of main-thread
 * time on a throttled phone, which Lighthouse counts as blocking time.)
 */
export function preloadOnIntent(target: EventTarget | null): void {
  if (target instanceof Element && target.closest('a[href$="#/app/start"], a[href$="#/app"]')) void loadGuidedDemo().catch(() => undefined);
}
