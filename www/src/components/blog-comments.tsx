import { useTheme } from 'next-themes';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';

const Giscus = lazy(() => import('@giscus/react'));

/**
 * A post's GitHub discussion, through giscus, as trpc.io had it. The mapping is
 * by discussion number, so giscus never creates a discussion: a post shows
 * comments only when its frontmatter names one with `discussion`.
 */
export function BlogComments(props: { readonly discussion: number }) {
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <section aria-label="Comments" className="min-h-64" id="comments" ref={ref}>
      {near ? (
        <Suspense fallback={null}>
          <Giscus
            emitMetadata="1"
            inputPosition="top"
            lang="en"
            loading="lazy"
            mapping="number"
            reactionsEnabled="1"
            repo="trpc/trpc"
            repoId="MDEwOlJlcG9zaXRvcnkyODA1NTcwNTQ"
            strict="0"
            term={String(props.discussion)}
            theme={resolvedTheme === 'dark' ? 'transparent_dark' : 'light'}
          />
        </Suspense>
      ) : null}
    </section>
  );
}
