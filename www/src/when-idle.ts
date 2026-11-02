/**
 * Runs `run` once the page has loaded and the browser is idle (within 10
 * seconds), for the scripts the page doesn't need to show: Sentry's SDK and
 * Google Analytics.
 */
export function whenIdle(run: () => void) {
  const idle = () => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(run, { timeout: 10_000 });
    } else {
      setTimeout(run, 0);
    }
  };
  if (document.readyState === 'complete') {
    idle();
  } else {
    window.addEventListener('load', idle, { once: true });
  }
}
