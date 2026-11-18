'use client';

import { Button } from '@shared/ui/components/button';
import { RotateCw } from 'lucide-react';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import type { Arrival, Mode, Run } from './meter';
import { endMs, isDone, meter } from './meter';

const modes: { value: Mode; label: string }[] = [
  { value: 'pipelined', label: 'One request' },
  { value: 'separate', label: 'Without pipelining' },
];

const dot: Record<Arrival['kind'], string> = {
  posts: 'bg-foreground',
  author: 'bg-sky-500',
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
 * sent, how long it has run, and when each result arrived
 */
export function LiveBar(props: {
  mode: Mode;
  onMode: (mode: Mode) => void;
  onReload: () => void;
}) {
  const name = useId();
  const run = useSyncExternalStore(meter.subscribe, meter.get, () => null);
  const elapsed = useElapsed(run);
  const done = run ? isDone(run) : false;
  const requests = run?.requests ?? [];
  const arrivals = run?.arrivals ?? [];
  const failed = run?.failed ?? 0;
  const streaming = requests.some((it) => it.doneMs === null);
  // The timeline grows when a load runs past 2.5 s
  const scale = Math.max(2500, elapsed);
  const at = (ms: number) => `${Math.min(100, (ms / scale) * 100)}%`;

  return (
    <div className="sticky top-2 z-10 grid gap-3 rounded-xl bg-card/85 p-3 shadow-lg ring-1 ring-foreground/10 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="radiogroup"
          aria-label="How the queries go"
          className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-medium"
        >
          {/* Native radios: one tab stop, and the arrow keys switch */}
          {modes.map((it) => (
            <label
              key={it.value}
              className="relative rounded-md px-2.5 py-1 text-muted-foreground hover:text-foreground has-[:checked]:bg-background has-[:checked]:text-foreground has-[:checked]:shadow-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <input
                type="radio"
                name={name}
                value={it.value}
                checked={props.mode === it.value}
                onChange={() => props.onMode(it.value)}
                // Unseen, over its label: a click on either picks it
                className="absolute inset-0 cursor-pointer appearance-none rounded-md outline-none"
              />
              {it.label}
            </label>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={props.onReload}>
          <RotateCw />
          Reload
        </Button>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-xs text-muted-foreground">Requests</dt>
          <dd
            key={requests.length}
            data-testid="request-count"
            className="animate-pop flex items-center justify-center gap-1.5 text-2xl font-semibold tabular-nums"
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
      <p className="sr-only" aria-live="polite">
        {done &&
          `Done in ${(elapsed / 1000).toFixed(2)} seconds: ${arrivals.length} results, ${requests.length} ${requests.length === 1 ? 'request' : 'requests'}${failed > 0 ? `, ${failed} failed` : ''}`}
      </p>
      {/* The timeline, for a screen reader: each result and when it came */}
      <ol className="sr-only" aria-label="Results as they arrived">
        {arrivals.map((it, i) => (
          <li key={i}>
            {it.kind} {it.label}, at {it.ms} ms
          </li>
        ))}
      </ol>
      <div aria-hidden className="grid gap-1">
        {/* Each result, where it arrived */}
        <div className="relative h-3">
          {arrivals.map((it, i) => (
            <span
              key={i}
              title={`${it.label} · ${it.ms} ms`}
              className={`animate-pop absolute top-0.5 size-2 -translate-x-1/2 rounded-full ring-2 ring-card ${dot[it.kind]}`}
              style={{ left: at(it.ms) }}
            />
          ))}
        </div>
        {/* Each request, from when it went to when its response ended */}
        {requests.map((it, i) => (
          <div key={i} className="relative h-1 rounded-full bg-muted">
            <div
              className={`absolute inset-y-0 rounded-full transition-[width] ${it.doneMs === null ? 'bg-emerald-500' : 'bg-emerald-500/50'}`}
              style={{
                left: at(it.ms),
                // A request that went after the last frame hasn't run for any time yet
                width: `calc(${at((it.doneMs ?? Math.max(elapsed, it.ms)) - it.ms)} + 0.25rem)`,
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

function Legend(props: { className: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block ${props.className}`} />
      {props.children}
    </span>
  );
}
