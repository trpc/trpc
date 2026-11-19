import { Button } from '@shared/ui/components/button';
import { RotateCw } from 'lucide-react';
import {
  type ReactNode,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  type Arrival,
  endMs,
  isDone,
  type Mode,
  meter,
  type Run,
} from '../-meter.ts';

const modeLabels: ReadonlyArray<{
  readonly label: string;
  readonly value: Mode;
}> = [
  { label: 'One request', value: 'pipelined' },
  { label: 'Without pipelining', value: 'separate' },
];

const dot: Readonly<Record<Arrival['kind'], string>> = {
  author: 'bg-sky-500',
  posts: 'bg-foreground',
  team: 'bg-amber-500',
};

/** Milliseconds since the run started, ticking each frame until it's done */
function useElapsed(run: Run | null) {
  const [now, setNow] = useState(0);
  const done = run ? isDone(run) : true;
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
  if (!run) {
    return 0;
  }
  return done ? endMs(run) : Math.max(0, Math.round(now - run.startedAt));
}

/**
 * Sticks to the top while the posts scroll by: how many requests the load
 * sent, how long it has run, and when each result arrived.
 */
export function LiveBar(props: {
  readonly mode: Mode;
  readonly onMode: (mode: Mode) => void;
  readonly onReload: () => void;
}) {
  const name = useId();
  const run = useSyncExternalStore(meter.subscribe, meter.get, () => null);
  const elapsed = useElapsed(run);
  const done = run ? isDone(run) : false;
  const requests = run?.requests ?? [];
  const arrivals = run?.arrivals ?? [];
  const failed = run?.failed ?? 0;
  const streaming = requests.some((request) => request.doneMs === null);
  // The timeline grows when a load runs past 2.5 s
  const scale = Math.max(2500, elapsed);
  const at = (ms: number) => `${Math.min(100, (ms / scale) * 100)}%`;

  return (
    <div className="sticky top-[calc(var(--site-header)+0.5rem)] z-10 grid gap-3 rounded-xl bg-card/85 p-3 shadow-lg ring-1 ring-foreground/10 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          aria-label="How the queries go"
          className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-medium"
          role="radiogroup"
        >
          {/* Native radios: one tab stop, and the arrow keys switch */}
          {modeLabels.map((option) => (
            <label
              className="relative rounded-md px-2.5 py-1 text-muted-foreground hover:text-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-2 has-focus-visible:ring-ring"
              key={option.value}
            >
              <input
                checked={props.mode === option.value}
                // Unseen, over its label: a click on either picks it
                className="absolute inset-0 cursor-pointer appearance-none rounded-md outline-none"
                name={name}
                onChange={() => props.onMode(option.value)}
                type="radio"
                value={option.value}
              />
              {option.label}
            </label>
          ))}
        </div>
        <Button onClick={props.onReload} size="sm" variant="outline">
          <RotateCw />
          Reload
        </Button>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-xs text-muted-foreground">Requests</dt>
          <dd
            className="flex items-center justify-center gap-1.5 text-2xl font-semibold tabular-nums motion-safe:animate-nested-pop"
            data-testid="request-count"
            key={requests.length}
          >
            {streaming && (
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full rounded-full bg-emerald-500 opacity-75 motion-safe:animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
            )}
            {requests.length}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">
            {done ? 'Done in' : 'Elapsed'}
          </dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {(elapsed / 1000).toFixed(2)}
            <span className="text-sm font-normal text-muted-foreground">
              {' '}
              s
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Results</dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {arrivals.length}
            <span className="text-sm font-normal text-muted-foreground">
              /{run?.expected ?? '…'}
            </span>
          </dd>
          {failed > 0 && (
            <dd className="text-xs text-destructive">{failed} failed</dd>
          )}
        </div>
      </dl>

      {/* Said once a load ends: one announcement, not one for each result */}
      <p aria-live="polite" className="sr-only">
        {done &&
          `Done in ${(elapsed / 1000).toFixed(2)} seconds: ${arrivals.length} results, ${requests.length} ${requests.length === 1 ? 'request' : 'requests'}${failed > 0 ? `, ${failed} failed` : ''}`}
      </p>
      {/* The timeline, for a screen reader: each result and when it came */}
      <ol aria-label="Results as they arrived" className="sr-only">
        {arrivals.map((arrival, i) => (
          <li key={i}>
            {arrival.kind} {arrival.label}, at {arrival.ms} ms
          </li>
        ))}
      </ol>
      <div aria-hidden className="grid gap-1">
        {/* Each result, where it arrived */}
        <div className="relative h-3">
          {arrivals.map((arrival, i) => (
            <span
              className={`absolute top-0.5 size-2 -translate-x-1/2 rounded-full ring-2 ring-card motion-safe:animate-nested-pop ${dot[arrival.kind]}`}
              key={i}
              style={{ left: at(arrival.ms) }}
              title={`${arrival.label} · ${arrival.ms} ms`}
            />
          ))}
        </div>
        {/* Each request, from when it went to when its response ended */}
        {requests.map((request, i) => (
          <div className="relative h-1 rounded-full bg-muted" key={i}>
            <div
              className={`absolute inset-y-0 rounded-full transition-[width] ${request.doneMs === null ? 'bg-emerald-500' : 'bg-emerald-500/50'}`}
              style={{
                left: at(request.ms),
                // A request that went after the last frame hasn't run for any time yet
                width: `calc(${at((request.doneMs ?? Math.max(elapsed, request.ms)) - request.ms)} + 0.25rem)`,
              }}
            />
          </div>
        ))}
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] text-muted-foreground">
          <Legend className={`size-2 rounded-full ${dot.posts}`}>Posts</Legend>
          <Legend className={`size-2 rounded-full ${dot.author}`}>
            Author
          </Legend>
          <Legend className={`size-2 rounded-full ${dot.team}`}>Team</Legend>
          <Legend className="h-1.5 w-3 rounded-full bg-emerald-500">
            Request
          </Legend>
        </div>
      </div>
    </div>
  );
}

function Legend(props: {
  readonly children: ReactNode;
  readonly className: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block ${props.className}`} />
      {props.children}
    </span>
  );
}
