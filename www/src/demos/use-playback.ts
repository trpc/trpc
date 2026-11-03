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

/**
 * Calls `onFirstView` once, when most of the element is on the screen. The
 * returned callback is the element's `ref`.
 */
export function useFirstView(onFirstView: () => void) {
  return useCallback(
    (element: HTMLElement | null) => {
      if (!element) {
        return undefined;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            onFirstView();
          }
        },
        { threshold: 0.6 },
      );
      observer.observe(element);
      return () => observer.disconnect();
    },
    [onFirstView],
  );
}

/**
 * A clock for a simulated timeline `duration` ms long, played `slowdown`
 * times slower than real time so it can be followed. It stays at 0 until
 * `play()`. With reduced motion, it's always at the end.
 */
export function usePlayback(duration: number, slowdown: number) {
  const reduced = usePrefersReducedMotion();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const time = reduced
    ? duration
    : startedAt === null
      ? 0
      : Math.min(duration, (now - startedAt) / slowdown);

  useEffect(() => {
    if (reduced || startedAt === null) {
      return undefined;
    }
    let frame = requestAnimationFrame(function tick(timestamp) {
      setNow(timestamp);
      if ((timestamp - startedAt) / slowdown < duration) {
        frame = requestAnimationFrame(tick);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [duration, reduced, slowdown, startedAt]);

  const play = useCallback(() => {
    const start = performance.now();
    setStartedAt(start);
    setNow(start);
  }, []);

  return {
    done: time >= duration,
    play,
    playing: !reduced && startedAt !== null && time < duration,
    reduced,
    time,
  };
}
