import { useSyncExternalStore } from 'react';

/** The id of a page's content, where a link to the page lands */
export const contentId = 'blog-page';

const reducedMotion = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(listener: () => void) {
  const query = window.matchMedia(reducedMotion);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

/**
 * What a link to another page of the blog has: it lands at the page's
 * content, under the sticky bar, and the page changes with a view
 * transition where the browser has them, unless the reader asked for
 * reduced motion. Back and forward restore where you were instead
 */
export function usePageLink() {
  const animate = useSyncExternalStore(
    subscribeReducedMotion,
    () => !window.matchMedia(reducedMotion).matches,
    () => false,
  );
  return { hash: contentId, viewTransition: animate } as const;
}

/** A link to a post: pass its `params` */
export function usePostLink() {
  return { ...usePageLink(), to: '/kitchen-sink/blog/$slug' } as const;
}
