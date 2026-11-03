import { useEffect, useState, useSyncExternalStore } from 'react';

import { cn } from '@shared/ui/lib/utils';

import { usePrefersReducedMotion } from '../use-playback.ts';
import { chainLength, type Network, type NetworkRequest } from './network.ts';

/** `performance.now()`, every frame while `active`; 0 on the first render. */
function useNow(active: boolean) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) {
      setNow(performance.now());
      return undefined;
    }
    let frame = requestAnimationFrame(function tick() {
      setNow(performance.now());
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return now;
}

function describeChain(count: number) {
  return count === 1
    ? '1 round trip'
    : `${count} round trips, one after another`;
}

const percent = (value: number) => `${Math.min(value, 1) * 100}%`;

const ms = (value: number) => `${Math.round(value / 10) * 10} ms`;

const barStyles = {
  aborted: 'border border-dashed border-muted-foreground/60 bg-transparent',
  done: 'bg-brand-dark dark:bg-brand-light',
  error: 'bg-destructive',
  pending: 'bg-brand-dark/60 dark:bg-brand-light/60',
} satisfies Record<NetworkRequest['status'], string>;

function describe(request: NetworkRequest, origin: number) {
  const start = Math.max(request.startedAt - origin, 0);
  switch (request.status) {
    case 'pending':
      return `started at ${ms(start)}, in flight`;
    case 'aborted':
      return `started at ${ms(start)}, cancelled`;
    case 'error':
      return `started at ${ms(start)}, failed`;
    case 'done':
      return `started at ${ms(start)}, done at ${ms((request.endedAt ?? 0) - origin)}`;
  }
}

/**
 * The requests since the last navigation, on a shared time axis, with the
 * moment the page showed. Ticks are typical round trips; each request takes
 * its own time.
 */
export function NetworkPanel(props: {
  readonly network: Pick<Network, 'getTrace' | 'latency' | 'subscribe'>;
  readonly summary: boolean;
}) {
  const network = props.network;
  const trace = useSyncExternalStore(
    network.subscribe,
    network.getTrace,
    network.getTrace,
  );
  const reduced = usePrefersReducedMotion();
  const pending = trace.requests.some(
    (request) => request.status === 'pending',
  );
  const now = useNow(pending && !reduced);
  const origin = trace.startedAt;
  const latest = Math.max(
    0,
    ...trace.requests.map((request) => (request.endedAt ?? now) - origin),
    trace.shownAt === undefined ? 0 : trace.shownAt - origin,
  );
  const roundTrips = Math.max(3, Math.ceil(latest / network.latency));
  const scale = roundTrips * network.latency;
  const shownAt =
    trace.shownAt === undefined ? undefined : (trace.shownAt - origin) / scale;
  const done = trace.requests.filter((request) => request.status === 'done');
  const lastDone = Math.max(
    0,
    ...done.map((request) => (request.endedAt ?? 0) - origin),
  );

  return (
    <section aria-label="Network" className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="font-medium">Network</span>
        {trace.label ? (
          <span className="truncate text-muted-foreground">
            since <span className="font-mono">{trace.label}</span>
          </span>
        ) : null}
      </div>
      {trace.requests.length === 0 ? (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          {trace.label
            ? 'No requests: the cache had fresh data.'
            : 'No requests yet.'}
        </p>
      ) : (
        <ol className="grid gap-1.5">
          {trace.requests.map((request) => {
            const start = Math.max(request.startedAt - origin, 0) / scale;
            const end =
              request.status === 'pending' && reduced
                ? 1
                : ((request.endedAt ?? now) - origin) / scale;
            return (
              <li
                className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]"
                key={request.id}
              >
                <span
                  className="truncate font-mono text-[0.7rem]"
                  title={request.label}
                >
                  {request.origin ? (
                    <span className="text-muted-foreground">
                      {request.origin}:{' '}
                    </span>
                  ) : null}
                  {request.label}
                </span>
                <span className="sr-only">{describe(request, origin)}</span>
                <div aria-hidden className="relative h-5 rounded bg-muted">
                  <div
                    className={cn(
                      'absolute inset-y-1 rounded-sm',
                      barStyles[request.status],
                      request.status === 'pending' &&
                        !reduced &&
                        'animate-pulse',
                    )}
                    style={{
                      left: percent(start),
                      width: `max(0.25rem, ${percent(Math.max(end - start, 0))})`,
                    }}
                  />
                  {shownAt === undefined ? null : (
                    <div
                      className="absolute -inset-y-1 w-px bg-chart-3"
                      style={{ left: percent(shownAt) }}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div
        aria-hidden
        className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-2 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]"
      >
        <span className="flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
          {shownAt === undefined ? null : (
            <>
              <span className="inline-block h-3 w-px bg-chart-3" /> page shown
            </>
          )}
        </span>
        <div className="relative h-4 font-mono text-[0.65rem] text-muted-foreground">
          {Array.from({ length: roundTrips + 1 }, (_, index) => (
            <span
              className={cn(
                'absolute',
                index === 0
                  ? 'left-0'
                  : index === roundTrips
                    ? 'right-0'
                    : '-translate-x-1/2',
                index === roundTrips - 1 && 'max-sm:hidden',
              )}
              key={index}
              style={
                index === 0 || index === roundTrips
                  ? undefined
                  : { left: percent(index / roundTrips) }
              }
            >
              {index === roundTrips
                ? ms(index * network.latency)
                : Math.round(index * network.latency)}
            </span>
          ))}
        </div>
      </div>
      <p aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
        {pending || !props.summary
          ? null
          : [
              trace.shownAt === undefined
                ? undefined
                : `Page shown at ${ms(trace.shownAt - origin)}.`,
              done.length === 0
                ? undefined
                : `Data in at ${ms(lastDone)}: ${describeChain(chainLength(trace.requests))}.`,
            ]
              .filter(Boolean)
              .join(' ')}
      </p>
    </section>
  );
}
