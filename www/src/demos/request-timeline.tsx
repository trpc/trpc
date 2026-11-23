import { RotateCcw } from 'lucide-react';
import { useId, useState } from 'react';

import { Button } from '@shared/ui/components/button';
import { cn } from '@shared/ui/lib/utils';

import type { DemoProps } from './names.ts';
import { Segmented } from './segmented.tsx';
import { createRandom } from './random.ts';
import { Reserve } from './reserve.tsx';
import {
  type LoadingStrategy,
  longestTimeline,
  progress,
  roundTrips,
  timeline,
  type TimelineRequest,
} from './timeline.ts';
import { useOnScreen, usePlayback } from './use-playback.ts';

const strategies: ReadonlyArray<{
  readonly label: string;
  readonly value: LoadingStrategy;
}> = [
  { label: 'Fetch-on-render', value: 'fetch-on-render' },
  { label: 'Render-as-you-fetch', value: 'render-as-you-fetch' },
];

const roundTripChoices = [100, 200, 400] as const;

/** Real milliseconds per simulated one, so a 200 ms round trip takes 0.8 s. */
const slowdown = 4;

const barColors = ['bg-brand-dark dark:bg-brand-light', 'bg-chart-2'] as const;

const percent = (value: number) => `${value * 100}%`;

function RequestRow(props: {
  readonly color: string;
  readonly request: TimelineRequest;
  readonly scale: number;
  readonly time: number;
}) {
  const request = props.request;
  const done = progress(request, props.time) === 1;
  const waited = Math.min(props.time, request.start);
  return (
    <li className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
      <span className="truncate font-mono text-xs">{request.label}</span>
      <span className="sr-only">
        {request.start === 0
          ? `starts at 0 ms`
          : `waits until ${request.start} ms, then starts`}
        , done at {request.end} ms
      </span>
      <div aria-hidden className="relative h-7 rounded-md bg-muted">
        {request.start > 0 && waited > 0 ? (
          <div
            className="absolute inset-y-1 left-0 flex items-center overflow-hidden rounded border border-dashed border-chart-3 bg-chart-3/10 px-1.5 text-[0.65rem] whitespace-nowrap text-muted-foreground"
            style={{ width: percent(waited / props.scale) }}
          >
            waiting for the post
          </div>
        ) : null}
        <div
          className={cn(
            'absolute inset-y-1 flex items-center justify-end overflow-hidden rounded px-1.5 data-[idle]:hidden text-[0.65rem] font-semibold whitespace-nowrap text-white dark:text-neutral-950',
            props.color,
          )}
          data-idle={progress(request, props.time) === 0 ? '' : undefined}
          style={{
            left: percent(request.start / props.scale),
            width: percent(
              (progress(request, props.time) * (request.end - request.start)) /
                props.scale,
            ),
          }}
        >
          {done ? `${request.end - request.start} ms` : null}
        </div>
      </div>
    </li>
  );
}

function PreviewComments() {
  return (
    <div className="grid gap-1.5">
      <p>💬 Nice post!</p>
      <p>💬 Ship it</p>
      <p>💬 +1</p>
    </div>
  );
}

function PagePreview(props: {
  readonly commentsRendered: boolean;
  readonly commentsReady: boolean;
  readonly postReady: boolean;
}) {
  return (
    <div
      aria-hidden
      className="grid content-start gap-2 rounded-lg border bg-background p-3 text-xs shadow-xs"
    >
      <div className="flex gap-1">
        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
      </div>
      {props.postReady ? (
        <p className="font-semibold">Hello, handles</p>
      ) : (
        <div className="h-4 w-3/4 rounded bg-muted motion-safe:animate-pulse" />
      )}
      <Reserve
        className="border-t pt-2"
        shapes={[<PreviewComments key="comments" />]}
      >
        {props.commentsReady ? (
          <PreviewComments />
        ) : props.commentsRendered ? (
          <p className="text-muted-foreground italic">Loading comments…</p>
        ) : null}
      </Reserve>
    </div>
  );
}

/**
 * The post page's two requests on one time axis, played back: with
 * fetch-on-render the comments wait for the post, with render-as-you-fetch
 * they start together.
 */
export function RequestTimeline(props: DemoProps) {
  const [strategy, setStrategy] = useState<LoadingStrategy>(
    props.options['strategy'] === 'render-as-you-fetch'
      ? 'render-as-you-fetch'
      : 'fetch-on-render',
  );
  const [roundTrip, setRoundTrip] = useState<number>(200);
  // The first run takes the usual times, as the static timeline does; each
  // replay draws new ones, the same for both strategies.
  const [seed, setSeed] = useState(0);
  const plan = timeline(
    strategy,
    roundTrip,
    seed === 0 ? undefined : createRandom(seed),
  );
  const [onScreen, onScreenRef] = useOnScreen();
  const playback = usePlayback(plan.readyAt, slowdown, onScreen);
  // The longest any run can be, so strategies and replays share an axis.
  const scale = longestTimeline * roundTrip;
  const ticks = Array.from(
    { length: Math.floor(longestTimeline) + 1 },
    (_, index) => index * roundTrip,
  );
  const [post, comments] = plan.requests;
  const roundTripLabel = useId();
  const current = plan.steps.findLast((step) => step.at <= playback.time);
  const summary = (
    <>
      <strong>
        Ready at {plan.readyAt} ms:{' '}
        {strategy === 'fetch-on-render'
          ? `${roundTrips(strategy)} round trips, one after the other.`
          : 'both requests at once, as long as the slower one.'}
      </strong>{' '}
      {strategy === 'fetch-on-render'
        ? 'Comments only exists once the post has arrived, so its request waits, and the times add up.'
        : 'The loader knew both inputs up front, so neither request waits.'}
    </>
  );

  return (
    <figure
      className="not-prose my-8 grid gap-4 rounded-xl border bg-card p-4 text-card-foreground sm:p-5"
      ref={onScreenRef}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          aria-label="How the page loads its data"
          onChange={(next) => {
            setStrategy(next);
            playback.play();
          }}
          options={strategies}
          value={strategy}
        />
        <Button
          onClick={() => {
            setSeed(seed + 1);
            playback.play();
          }}
          size="sm"
          variant="outline"
        >
          <RotateCcw data-icon="inline-start" />
          {playback.reduced ? 'New times' : 'Replay with new times'}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <div className="grid content-start gap-2">
          <ol aria-label="Requests" className="grid gap-2">
            <RequestRow
              color={barColors[0]}
              request={post}
              scale={scale}
              time={playback.time}
            />
            <RequestRow
              color={barColors[1]}
              request={comments}
              scale={scale}
              time={playback.time}
            />
          </ol>
          <div
            aria-hidden
            className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 sm:grid-cols-[7.5rem_minmax(0,1fr)]"
          >
            <span />
            <div className="relative h-4 font-mono text-[0.65rem] text-muted-foreground">
              {ticks.map((tick, index) => (
                <span
                  className={cn(
                    'absolute whitespace-nowrap',
                    index > 0 && '-translate-x-1/2',
                  )}
                  key={tick}
                  style={{ left: percent(tick / scale) }}
                >
                  {tick}
                  {index === ticks.length - 1 ? ' ms' : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
        <PagePreview
          commentsReady={progress(comments, playback.time) === 1}
          commentsRendered={
            strategy === 'render-as-you-fetch' ||
            progress(post, playback.time) === 1
          }
          postReady={progress(post, playback.time) === 1}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span id={roundTripLabel}>Round trip</span>
        <Segmented
          aria-labelledby={roundTripLabel}
          onChange={(next) => {
            setRoundTrip(Number(next));
            playback.play();
          }}
          options={roundTripChoices.map((choice) => ({
            label: `${choice} ms`,
            value: String(choice),
          }))}
          value={String(roundTrip)}
        />
      </div>

      <figcaption aria-live="polite" className="text-sm">
        <Reserve shapes={[summary, ...plan.steps.map((step) => step.text)]}>
          {playback.done ? (
            summary
          ) : (
            <span className="text-muted-foreground">{current?.text}</span>
          )}
        </Reserve>
      </figcaption>
    </figure>
  );
}
