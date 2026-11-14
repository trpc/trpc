import { ArrowLeft, RotateCw } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@shared/ui/components/button';
import { cn } from '@shared/ui/lib/utils';

import type { DemoProps } from './names.ts';
import { Segmented } from './segmented.tsx';
import {
  defaultInput,
  formatInput,
  inputKey,
  lastPage,
  type ListInput,
  listPosts,
  listUrl,
  parseListUrl,
  type Sort,
} from './url-state.ts';

type SortLivesIn = 'url' | 'state';

interface LogEntry {
  readonly id: number;
  readonly input: ListInput;
  readonly source: 'loader' | 'render';
  readonly status: 'cached' | 'done' | 'fetching';
}

/** Real milliseconds a simulated request takes. */
const requestDuration = 700;

const sorts: ReadonlyArray<{ readonly label: string; readonly value: Sort }> = [
  { label: 'New', value: 'new' },
  { label: 'Top', value: 'top' },
];

const sortHomes: ReadonlyArray<{
  readonly label: string;
  readonly value: SortLivesIn;
}> = [
  { label: 'the URL', value: 'url' },
  { label: 'component state', value: 'state' },
];

function urlFor(sortLivesIn: SortLivesIn, input: ListInput) {
  return sortLivesIn === 'url' ? listUrl(input) : listUrl({ page: input.page });
}

/**
 * A `/posts?sort=…&page=…` page in a small browser: with the sort in the URL,
 * the loader starts the list for every URL, including after a reload; with
 * the sort in component state, only render can, and a reload forgets it.
 */
export function UrlInput(_props: DemoProps) {
  const [sortLivesIn, setSortLivesIn] = useState<SortLivesIn>('url');
  const [history, setHistory] = useState<ReadonlyArray<string>>([
    listUrl(defaultInput),
  ]);
  const [position, setPosition] = useState(0);
  const [stateSort, setStateSort] = useState<Sort>(defaultInput.sort);
  const [typed, setTyped] = useState<string | null>(null);
  // The first page came with the server render.
  const [cached, setCached] = useState<ReadonlySet<string>>(
    () => new Set([inputKey(defaultInput)]),
  );
  const [log, setLog] = useState<ReadonlyArray<LogEntry>>([
    { id: 0, input: defaultInput, source: 'loader', status: 'done' },
  ]);
  const nextId = useRef(1);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const addressLabel = useId();

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) {
        clearTimeout(timer);
      }
    };
  }, []);

  const url = history[position] ?? listUrl(defaultInput);
  const fromUrl = parseListUrl(url);
  const input: ListInput =
    sortLivesIn === 'url' ? fromUrl : { page: fromUrl.page, sort: stateSort };

  function request(
    next: ListInput,
    source: LogEntry['source'],
    cache: ReadonlySet<string>,
  ) {
    const id = nextId.current++;
    const key = inputKey(next);
    const hit = cache.has(key);
    setLog((current) =>
      [
        {
          id,
          input: next,
          source,
          status: hit ? 'cached' : 'fetching',
        } as const,
        ...current,
      ].slice(0, 4),
    );
    if (hit) {
      return;
    }
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setCached((current) => new Set(current).add(key));
      setLog((current) =>
        current.map((entry) =>
          entry.id === id ? { ...entry, status: 'done' } : entry,
        ),
      );
    }, requestDuration);
    timers.current.add(timer);
  }

  /** Loads `nextUrl` as the route would: the loader, then render. */
  function load(
    nextUrl: string,
    nextSortLivesIn: SortLivesIn,
    sort: Sort,
    cache: ReadonlySet<string>,
  ) {
    const parsed = parseListUrl(nextUrl);
    if (nextSortLivesIn === 'url') {
      request(parsed, 'loader', cache);
    } else {
      request({ page: parsed.page, sort }, 'render', cache);
    }
  }

  function navigate(next: ListInput) {
    const nextUrl = urlFor(sortLivesIn, next);
    setHistory([...history.slice(0, position + 1), nextUrl]);
    setPosition(position + 1);
    setTyped(null);
    load(nextUrl, sortLivesIn, next.sort, cached);
  }

  function changeSort(sort: Sort) {
    if (sortLivesIn === 'url') {
      navigate({ ...input, sort });
      return;
    }
    // A state change re-renders the page; the URL and the loader don't see it.
    setStateSort(sort);
    request({ ...input, sort }, 'render', cached);
  }

  function reload(nextSortLivesIn: SortLivesIn, nextUrl: string) {
    const empty = new Set<string>();
    setCached(empty);
    setStateSort(defaultInput.sort);
    setTyped(null);
    load(nextUrl, nextSortLivesIn, defaultInput.sort, empty);
  }

  const posts = cached.has(inputKey(input)) ? listPosts(input) : null;

  return (
    <figure className="not-prose my-8 grid gap-4 rounded-xl border bg-card p-4 text-card-foreground sm:p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground" id={`${addressLabel}-where`}>
          Keep the sort in
        </span>
        <Segmented
          aria-labelledby={`${addressLabel}-where`}
          onChange={(next) => {
            const nextUrl = urlFor(next, input);
            setSortLivesIn(next);
            setHistory([nextUrl]);
            setPosition(0);
            setLog([]);
            reload(next, nextUrl);
          }}
          options={sortHomes}
          value={sortLivesIn}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-lg border bg-background">
          <div className="flex items-center gap-1 border-b bg-muted/50 p-1.5">
            <Button
              aria-label="Back"
              disabled={position === 0}
              onClick={() => {
                const previous = history[position - 1];
                if (previous === undefined) {
                  return;
                }
                setPosition(position - 1);
                setTyped(null);
                load(previous, sortLivesIn, stateSort, cached);
              }}
              size="icon-xs"
              variant="ghost"
            >
              <ArrowLeft />
            </Button>
            <Button
              aria-label="Reload"
              onClick={() => reload(sortLivesIn, url)}
              size="icon-xs"
              variant="ghost"
            >
              <RotateCw />
            </Button>
            <form
              className="min-w-0 flex-1"
              onSubmit={(event) => {
                event.preventDefault();
                if (typed === null) {
                  return;
                }
                const parsed = parseListUrl(typed);
                navigate(
                  sortLivesIn === 'url'
                    ? parsed
                    : { page: parsed.page, sort: stateSort },
                );
              }}
            >
              <label className="sr-only" htmlFor={addressLabel}>
                Address
              </label>
              <input
                className="h-6 w-full rounded-md border bg-background px-2 font-mono text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                id={addressLabel}
                onBlur={() => setTyped(null)}
                onChange={(event) => setTyped(event.target.value)}
                spellCheck={false}
                value={typed ?? url}
              />
            </form>
          </div>
          <div className="grid gap-3 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Segmented
                aria-label="Sort"
                onChange={changeSort}
                options={sorts}
                value={input.sort}
              />
              <div className="flex items-center gap-1 text-xs">
                <Button
                  disabled={input.page === 1}
                  onClick={() => navigate({ ...input, page: input.page - 1 })}
                  size="xs"
                  variant="outline"
                >
                  Previous
                </Button>
                <span className="px-1 text-muted-foreground">
                  Page {input.page} of {lastPage}
                </span>
                <Button
                  disabled={input.page === lastPage}
                  onClick={() => navigate({ ...input, page: input.page + 1 })}
                  size="xs"
                  variant="outline"
                >
                  Next
                </Button>
              </div>
            </div>
            <ul aria-busy={posts === null} className="grid gap-1.5 text-sm">
              {posts
                ? posts.map((post) => (
                    <li
                      className="flex items-center justify-between gap-3 rounded-md border px-2.5 py-1.5"
                      key={post.title}
                    >
                      <span className="truncate">{post.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        ▲ {post.votes}
                      </span>
                    </li>
                  ))
                : [0, 1, 2].map((index) => (
                    <li
                      aria-hidden
                      className="h-8 rounded-md bg-muted motion-safe:animate-pulse"
                      key={index}
                    />
                  ))}
            </ul>
          </div>
        </div>

        <div className="grid content-start gap-3">
          <div className="grid gap-1.5">
            <p className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
              What the loader sees
            </p>
            <pre className="overflow-x-auto rounded-lg border bg-background p-2.5 font-mono text-[0.7rem] leading-relaxed">
              {sortLivesIn === 'url'
                ? `loaderDeps: ({ search }) => search,\n// ${formatInput(fromUrl)}\nloader: ({ deps }) =>\n  loadHandles(trpc, {\n    posts: prefetchEntry(trpc.post.list, deps),\n  }),`
                : `loaderDeps: ({ search }) => search,\n// ${formatInput({ page: fromUrl.page })}\n// The sort is in useState, so the list\n// can only start once the page renders.`}
            </pre>
          </div>
          <div className="grid gap-1.5">
            <p className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
              Requests
            </p>
            <ol aria-label="Requests, newest first" className="grid gap-1">
              {log.map((entry) => (
                <li
                  className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border bg-background px-2 py-1 font-mono text-[0.7rem]"
                  key={entry.id}
                >
                  <span
                    className={cn(
                      'rounded px-1 font-sans text-[0.65rem] font-semibold',
                      entry.source === 'loader'
                        ? 'bg-green-600/15 text-green-800 dark:text-green-300'
                        : 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
                    )}
                  >
                    {entry.source === 'loader' ? 'loader' : 'in render'}
                  </span>
                  <span className="min-w-0 truncate">
                    post.list({formatInput(entry.input)})
                  </span>
                  <span className="ml-auto font-sans text-muted-foreground">
                    {entry.status === 'fetching'
                      ? 'fetching…'
                      : entry.status === 'cached'
                        ? 'cached'
                        : 'done'}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      <figcaption aria-live="polite" className="text-sm">
        {sortLivesIn === 'url' ? (
          <>
            <strong>The URL holds the whole input.</strong> Every navigation,
            the back button and a reload give the loader everything it needs, so
            the list starts before the page renders.
          </>
        ) : (
          <>
            <strong>The sort lives in component state.</strong> The loader
            can&apos;t see it, so the list only starts in render. Sort by Top
            and reload: the page forgets it, and a shared link would too.
          </>
        )}
      </figcaption>
    </figure>
  );
}
