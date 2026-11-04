import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

const reducedMotion = '(prefers-reduced-motion: reduce)';

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(reducedMotion);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * Whether the reader asked for reduced motion. The server renders the demos
 * for readers who didn't, the most of them, so most pages hydrate without
 * a change.
 */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(reducedMotion).matches,
    () => false,
  );
}

/** Half the element, or, for one taller than the screen, half the screen. */
function mostlyOnScreen(entry: IntersectionObserverEntry) {
  return (
    entry.intersectionRatio >= 0.5 ||
    (entry.rootBounds !== null &&
      entry.intersectionRect.height >= entry.rootBounds.height / 2)
  );
}

/**
 * Whether the element is on the screen: from when most of it is, until none
 * of it is. False on the server and on the first render. The returned
 * callback is the element's `ref`.
 */
export function useOnScreen() {
  const [onScreen, setOnScreen] = useState(false);
  const ref = useCallback((element: HTMLElement | null) => {
    if (!element) {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (mostlyOnScreen(entry)) {
            setOnScreen(true);
          } else if (!entry.isIntersecting) {
            setOnScreen(false);
          }
        }
      },
      { threshold: [0, 0.25, 0.5] },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [onScreen, ref] as const;
}

/**
 * A clock for a simulated timeline `duration` ms long, played `slowdown`
 * times slower than real time so it can be followed. It starts the first
 * time `onScreen` is true, stops while it's false, and starts over on
 * `play()`. With reduced motion, it's always at the end.
 */
export function usePlayback(
  duration: number,
  slowdown: number,
  onScreen: boolean,
) {
  const reduced = usePrefersReducedMotion();
  const [started, setStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const time = reduced ? duration : Math.min(duration, elapsed / slowdown);
  const running = !reduced && started && onScreen && time < duration;

  useEffect(() => {
    if (onScreen) {
      setStarted(true);
    }
  }, [onScreen]);

  useEffect(() => {
    if (!running) {
      return undefined;
    }
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(timestamp) {
      setElapsed((current) => current + Math.max(0, timestamp - last));
      last = timestamp;
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [running]);

  const play = useCallback(() => {
    setStarted(true);
    setElapsed(0);
  }, []);

  return { done: time >= duration, play, reduced, time };
}
