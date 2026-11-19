import { useEffect, useState, useSyncExternalStore } from 'react';

import { cn } from '@shared/ui/lib/utils';

import { usePrefersReducedMotion } from '../use-playback.ts';
import { chainLength, type Network, type NetworkRequest } from './network.ts';

/** `clock()`, every frame while `active`; 0 on the first render. */
function useNow(active: boolean, clock: () => number) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) {
      setNow(clock());
      return undefined;
    }
    let frame = requestAnimationFrame(function tick() {
      setNow(clock());
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, clock]);
  return now;
}

/**
 * Whether `idle` has held for `ms`. A waterfall has nothing in flight for a
 * moment between two of its requests, which isn't the end of it.
 */
function useSettled(idle: boolean, ms: number) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!idle) {
      setSettled(false);
      return undefined;
    }
    const timer = setTimeout(() => setSettled(true), ms);
    return () => clearTimeout(timer);
  }, [idle, ms]);
  return idle && settled;
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

/** A request's time on the wire, around its time on the server. */
const tripStyles = {
  aborted: barStyles.aborted,
  done: 'bg-brand-dark/30 dark:bg-brand-light/30',
  error: 'bg-destructive/40',
  pending: 'bg-brand-dark/30 dark:bg-brand-light/30',
} satisfies Record<NetworkRequest['status'], string>;

const serverStyle = 'bg-brand-dark dark:bg-brand-light';

function describe(request: NetworkRequest, origin: number, sent: Sent) {
  const start = Math.max(request.startedAt - origin, 0);
  const where = sent.number === undefined ? '' : `request ${sent.number}, `;
  switch (request.status) {
    case 'pending':
      return `${where}started at ${ms(start)}, in flight`;
    case 'aborted':
      return `${where}started at ${ms(start)}, cancelled`;
    case 'error':
      return `${where}started at ${ms(start)}, failed`;
    case 'done':
      return `${where}started at ${ms(start)}, done at ${ms((request.endedAt ?? 0) - origin)}`;
  }
}

interface Sent {
  /** Whether the row is the first of its HTTP request. */
  readonly first: boolean;
  /** The HTTP request's number since the navigation, from 1. */
  readonly number: number | undefined;
}

/** Which HTTP request each row went in, numbered from the navigation. */
function numberRequests(requests: ReadonlyArray<NetworkRequest>) {
  const numbers = new Map<number, number>();
  return requests.map((request): Sent => {
    if (request.http === undefined) {
      return { first: true, number: undefined };
    }
    const known = numbers.get(request.http);
    const number = known ?? numbers.size + 1;
    numbers.set(request.http, number);
    return { first: known === undefined, number };
  });
}

/**
 * The row's place among the HTTP requests: its number on the request's
 * first call, and a mark on the calls that went with it.
 */
function RequestMark(props: { readonly sent: Sent }) {
  if (props.sent.number === undefined) {
    return null;
  }
  return props.sent.first ? (
    <span
      aria-hidden
      className="grid size-4 shrink-0 place-items-center rounded-full bg-foreground text-[0.6rem] font-semibold text-background tabular-nums"
    >
      {props.sent.number}
    </span>
  ) : (
    <span
      aria-hidden
      className="grid size-4 shrink-0 place-items-center text-muted-foreground"
    >
      ↳
    </span>
  );
}

/**
 * The requests since the last navigation, on a shared time axis, with the
 * moment the page showed. Ticks are typical round trips; each request takes
 * its own time.
 */
export function NetworkPanel(props: {
  readonly network: Pick<Network, 'getTrace' | 'latency' | 'now' | 'subscribe'>;
  /** Whether the demo is running: the bars only grow while it is. */
  readonly playing: boolean;
  readonly summary: boolean;
  /**
   * Whether the demo's calls go in HTTP requests: the rows are numbered by
   * request, and each bar shows the trip apart from the server's work.
   */
  readonly wire: boolean;
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
  const now = useNow(pending && !reduced && props.playing, network.now);
  const settled = useSettled(!pending, 250);
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
  const sent = numberRequests(trace.requests);
  // A call in a shared request shows where its input comes from, which is long
  const columns = cn(
    'grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-2',
    props.wire
      ? 'sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]'
      : 'sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]',
  );

  return (
    <section aria-label="Network" className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-medium">Network</span>
          {props.wire ? (
            <span
              aria-hidden
              className="flex items-center gap-x-3 text-[0.65rem] text-muted-foreground"
            >
              <span className="flex items-center gap-1">
                <span
                  className={cn(
                    'inline-block h-2 w-3 rounded-sm',
                    tripStyles.done,
                  )}
                />
                on the wire
              </span>
              <span className="flex items-center gap-1">
                <span
                  className={cn('inline-block h-2 w-1 rounded-sm', serverStyle)}
                />
                on the server
              </span>
            </span>
          ) : null}
        </span>
        {trace.label ? (
          <span className="truncate text-muted-foreground">
            since <span className="font-mono">{trace.label}</span>
          </span>
        ) : null}
      </div>
      {/* At least as tall as three requests, the most a page here starts
          with, so the panel keeps its height as they come in. */}
      {trace.requests.length === 0 ? (
        <p className="min-h-18 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          {trace.label
            ? 'No requests: the cache had fresh data.'
            : 'No requests yet.'}
        </p>
      ) : (
        <ol className="grid min-h-18 content-start gap-1.5">
          {trace.requests.map((request, index) => {
            const start = Math.max(request.startedAt - origin, 0) / scale;
            const end =
              request.status === 'pending' && reduced
                ? 1
                : ((request.endedAt ?? now) - origin) / scale;
            // The part of the bar the server worked for, once it has started
            const serving =
              request.servingAt === undefined
                ? undefined
                : (request.servingAt - origin) / scale;
            const served =
              serving === undefined
                ? undefined
                : Math.min(
                    ((request.servedAt ?? request.endedAt ?? now) - origin) /
                      scale,
                    end,
                  );
            const mark = sent[index] ?? { first: true, number: undefined };
            return (
              <li className={cn('items-center', columns)} key={request.id}>
                <span className="flex min-w-0 items-center gap-1.5">
                  <RequestMark sent={mark} />
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
                </span>
                <span className="sr-only">
                  {describe(request, origin, mark)}
                </span>
                <div aria-hidden className="relative h-5 rounded bg-muted">
                  <div
                    className={cn(
                      'absolute inset-y-1 rounded-sm',
                      (props.wire ? tripStyles : barStyles)[request.status],
                      request.status === 'pending' &&
                        !reduced &&
                        'animate-pulse',
                    )}
                    style={{
                      left: percent(start),
                      width: `max(0.25rem, ${percent(Math.max(end - start, 0))})`,
                    }}
                  />
                  {serving === undefined || served === undefined ? null : (
                    <div
                      className={cn(
                        'absolute inset-y-1 rounded-sm',
                        request.status === 'error'
                          ? barStyles.error
                          : serverStyle,
                      )}
                      style={{
                        left: percent(serving),
                        width: `max(0.1875rem, ${percent(Math.max(served - serving, 0))})`,
                      }}
                    />
                  )}
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
      <div aria-hidden className={columns}>
        <span className="flex h-4 items-center gap-1.5 text-[0.65rem] text-muted-foreground">
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
        {!settled || !props.summary
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
