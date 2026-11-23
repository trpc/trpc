import { Star } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@shared/ui/lib/utils';
import { site } from '~/site.ts';

const numberFormat = new Intl.NumberFormat('en-US');

let starsOnce: Promise<number | undefined> | undefined;

/** The repo's stars, fetched once per page load; `undefined` if GitHub didn't answer. */
function fetchStars() {
  starsOnce ??= fetch('https://api.github.com/repos/trpc/trpc', {
    headers: { accept: 'application/vnd.github+json' },
  })
    .then((response) => (response.ok ? response.json() : undefined))
    .then((data: unknown) => {
      const stars =
        typeof data === 'object' && data !== null
          ? (data as Record<string, unknown>)['stargazers_count']
          : undefined;
      return typeof stars === 'number' ? stars : undefined;
    })
    .catch(() => undefined);
  return starsOnce;
}

/**
 * trpc.io's hero "Star" button: the count fades in once GitHub answers, in
 * a slot as wide as `88,888`, so the button keeps its size before, after,
 * and when the fetch fails.
 */
export function GithubStarsButton(props: { readonly className: string }) {
  const [stars, setStars] = useState<number>();
  useEffect(() => {
    let live = true;
    void fetchStars().then((count) => {
      if (live) {
        setStars(count);
      }
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <a
      aria-label={
        stars === undefined
          ? 'Star tRPC on GitHub'
          : `Star tRPC on GitHub, ${numberFormat.format(stars)} stars`
      }
      className={props.className}
      href={site.github}
      rel="noopener"
      target="_blank"
    >
      <Star strokeWidth={3} />
      Star
      <span aria-hidden="true" className="inline-grid text-left tabular-nums">
        <span className="invisible col-start-1 row-start-1">
          {numberFormat.format(88_888)}
        </span>
        <span
          className={cn(
            'col-start-1 row-start-1 transition-[opacity,translate] duration-1000 ease-out motion-reduce:transition-none',
            stars === undefined
              ? '-translate-x-1 opacity-0'
              : 'translate-x-0 opacity-100',
          )}
        >
          {stars === undefined ? '' : numberFormat.format(stars)}
        </span>
      </span>
    </a>
  );
}
