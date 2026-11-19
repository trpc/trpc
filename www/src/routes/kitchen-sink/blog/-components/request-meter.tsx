import { useQueryClient } from '@tanstack/react-query';
import { ChevronDownIcon } from 'lucide-react';
import {
  type ReactNode,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  countEarlier,
  endMs,
  meter,
  pathOf,
  type Run,
} from '../-request-meter.ts';

/** A store that never changes, for whether this has mounted */
const subscribeNever = () => () => undefined;

const colors = [
  'bg-foreground',
  'bg-sky-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
];

/** A color for each procedure, in the order the run first saw it */
function colorsOf(run: Run) {
  const paths = [...new Set(run.arrivals.map((it) => it.path))];
  return new Map(
    paths.map((path, at) => [path, colors[at % colors.length] ?? '']),
  );
}

/**
 * Counts what the blog's queries do, without touching them: each data a
 * query gets, and whether any is still loading. The showcase's query client
 * has only the blog's queries.
 */
function useBlogQueries() {
  const queryClient = useQueryClient();
  const [fetching, setFetching] = useState(0);
  useEffect(() => {
    const cache = queryClient.getQueryCache();
    // The data that came in this run before this mounted, such as what the
    // server sent with the page, or a query that finished before it
    countEarlier(cache);
    // The run each query started fetching in, so data that comes after a
    // navigation counts in the run that asked for it. The loaders start
    // their queries before this mounts: those are of the current run
    const runOf = new Map<string, number>();
    for (const query of cache.findAll({ fetchStatus: 'fetching' })) {
      runOf.set(query.queryHash, meter.get().id);
    }
    const unsubscribeCache = cache.subscribe((event) => {
      const { queryHash } = event.query;
      if (event.type === 'updated' && event.action.type === 'fetch') {
        runOf.set(queryHash, meter.get().id);
      }
      // A query that got its data: by itself, or with the page the server
      // sent
      const arrived =
        (event.type === 'updated' && event.action.type === 'success') ||
        (event.type === 'added' && event.query.state.status === 'success');
      const id = runOf.get(queryHash) ?? meter.get().id;
      if (arrived) {
        runOf.delete(queryHash);
      }
      // A page's `<HydrationBoundary>` adds queries while it renders, and
      // this updates the meter, so it waits for the render to end
      queueMicrotask(() => {
        if (arrived) {
          meter.arrive({ at: null, id, path: pathOf(event.query.queryKey) });
        }
        setFetching(queryClient.isFetching());
      });
    });
    return unsubscribeCache;
  }, [queryClient]);
  return fetching;
}

/** Milliseconds since the run started, ticking each frame until it's done */
function useElapsed(run: Run, done: boolean) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (done) {
      return;
    }
    let frame = requestAnimationFrame(function tick() {
      setNow(performance.now());
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [done]);
  return done ? endMs(run) : Math.max(0, Math.round(now - run.startedAt));
}

/**
 * A pill in the blog's sticky bar: how many requests the blog sent since the
 * last navigation, how many results came, and how long they took. Hovering
 * it, or pressing it, opens the timeline: when each query's data arrived,
 * and each request. The first run starts when the page loads, so it also
 * shows the data the server sent with the page.
 */
export function RequestMeter() {
  const fetching = useBlogQueries();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  // The server renders it before any of its data is there: dashes until then
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const run = useSyncExternalStore(meter.subscribe, meter.get, meter.getServer);
  const streaming = run.requests.some((it) => it.doneMs === null);
  const done = fetching === 0 && !streaming;
  const elapsed = useElapsed(run, done);
  const color = colorsOf(run);
  const { requests, arrivals } = run;
  // The timeline grows when a load runs past 2.5 s
  const scale = Math.max(2500, elapsed);
  const at = (ms: number) => `${Math.min(100, (ms / scale) * 100)}%`;
  const seconds = `${(elapsed / 1000).toFixed(2)} s`;
  const plural = (count: number, word: string) =>
    `${count} ${word}${count === 1 ? '' : 's'}`;

  return (
    <div className="group relative min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 text-xs whitespace-nowrap tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        onClick={() => setOpen((it) => !it)}
      >
        <span className="relative flex size-2 shrink-0">
          {streaming && (
            <span className="absolute inline-flex size-full rounded-full bg-emerald-500 opacity-75 motion-safe:animate-ping" />
          )}
          <span
            className={`relative inline-flex size-2 rounded-full ${done ? 'bg-emerald-500/50' : 'bg-emerald-500'}`}
          />
        </span>
        {mounted ? (
          <span className="truncate">
            <span className="font-semibold">
              {plural(requests.length, 'request')}
            </span>
            <span className="text-muted-foreground">
              {' · '}
              {plural(arrivals.length, 'result')}
              <span className="max-sm:hidden">
                {' · '}
                {seconds}
              </span>
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">Request meter</span>
        )}
        <ChevronDownIcon
          aria-hidden
          className={`size-3 shrink-0 transition-transform max-sm:hidden ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Said once a load ends: one announcement, not one for each result */}
      <p className="sr-only" aria-live="polite">
        {mounted &&
          done &&
          arrivals.length > 0 &&
          `Done in ${(elapsed / 1000).toFixed(2)} seconds: ${arrivals.length} results, ${requests.length} ${requests.length === 1 ? 'request' : 'requests'}`}
      </p>

      {/* Over the page, so it opens without moving it. Hovering opens it
          too, where there is a pointer that hovers */}
      <div
        id={panelId}
        className={`absolute top-full right-0 z-10 w-[min(24rem,calc(100vw-2rem))] pt-2 group-hover:block ${open ? 'block' : 'hidden'}`}
      >
        <div className="grid gap-3 rounded-xl bg-card p-3 text-xs shadow-lg ring-1 ring-foreground/10">
          {mounted && run.id === 0 && requests.length === 0 && (
            <p className="text-muted-foreground">
              The server rendered this page and sent its data with it: the
              browser sent no request. Follow a link to see one.
            </p>
          )}
          <ol className="sr-only" aria-label="Results as they arrived">
            {arrivals.map((it, index) => (
              <li key={index}>
                {it.path}, at {it.ms} ms
              </li>
            ))}
          </ol>
          <div aria-hidden className="grid gap-1">
            {/* Each query's data, where it arrived */}
            <div className="relative h-3">
              {arrivals.map((it, index) => (
                <span
                  key={index}
                  title={`${it.path} · ${it.ms} ms`}
                  className={`absolute top-0.5 size-2 -translate-x-1/2 rounded-full ring-2 ring-card motion-safe:animate-arrive ${color.get(it.path)}`}
                  style={{ left: at(it.ms) }}
                />
              ))}
            </div>
            {/* Each request, from when it went to when its response ended */}
            {requests.map((it, index) => (
              <div
                key={index}
                title={it.paths.join(', ')}
                className="relative h-1 rounded-full bg-muted"
              >
                <div
                  className={`absolute inset-y-0 rounded-full ${it.doneMs === null ? 'bg-emerald-500' : 'bg-emerald-500/50'}`}
                  style={{
                    left: at(it.ms),
                    // A request that went after the last frame hasn't run for any time yet
                    width: `calc(${at((it.doneMs ?? Math.max(elapsed, it.ms)) - it.ms)} + 0.25rem)`,
                  }}
                />
              </div>
            ))}
            <div className="flex justify-between pt-0.5 text-[11px] text-muted-foreground tabular-nums">
              <span>0 s</span>
              <span>{(scale / 1000).toFixed(1)} s</span>
            </div>
          </div>
          <div
            aria-hidden
            className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground"
          >
            {[...color].map(([path, className]) => (
              <Legend key={path} className={`size-2 rounded-full ${className}`}>
                {path.replace(/^blog\./, '')}
              </Legend>
            ))}
            <Legend className="h-1.5 w-3 rounded-full bg-emerald-500">
              Request
            </Legend>
          </div>
        </div>
      </div>
    </div>
  );
}

function Legend(props: {
  readonly className: string;
  readonly children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className={`inline-block ${props.className}`} />
      {props.children}
    </span>
  );
}
