import { type ReactNode, useEffect, useId, useState } from 'react';

import { Segmented } from '../segmented.tsx';
import { useOnScreen } from '../use-playback.ts';
import { idleNetwork, latencies } from './network.ts';
import { NetworkPanel } from './network-panel.tsx';
import { createSession, type Session, SessionProvider } from './session.tsx';

export interface DemoVariant<TValue extends string> {
  /** One sentence on what this variant does. */
  readonly description: ReactNode;
  readonly label: ReactNode;
  readonly value: TValue;
}

interface Run {
  readonly id: number;
  /** Where a reloaded tab reopens. */
  readonly location: string | undefined;
  /** None until the demo has first been on the screen. */
  readonly session: Session | undefined;
}

const initialLatency: number = latencies[1].ms;

let runs = 0;

function newRun(
  latency: number,
  origin: string | undefined,
  location?: string,
): Run {
  runs++;
  return { id: runs, location, session: createSession(latency, origin) };
}

export interface DemoRun<TValue extends string> {
  /** Where to open, if the tab was reloaded. */
  readonly location: string | undefined;
  /** Start over, as a reloaded tab: a new cache and network, at `location`. */
  readonly reload: (location?: string) => void;
  /** None until the demo has started. */
  readonly session: Session | undefined;
  readonly variant: TValue;
}

/**
 * A live demo's card: a title, what to try, a switch between its variants,
 * a latency switch and the network panel. Each variant, and each reload,
 * runs in a fresh session. The server renders the card before its first
 * session, with nothing random or timed in it. The first session starts when
 * the demo first comes on the screen, and its network pauses while the demo
 * is off it: requests in flight wait, and carry on when it's back.
 */
export function DemoFrame<TValue extends string>(props: {
  readonly children: (run: DemoRun<TValue>) => ReactNode;
  readonly hint: ReactNode;
  /** The fence's `variant=` option: the one to show first. */
  readonly initial?: string | undefined;
  /** The fence's `variants=a,b` option: the ones to offer. */
  readonly only?: string | undefined;
  /** Labels the session's requests, for a demo with a second client. */
  readonly origin?: string;
  /** Whether the network panel sums up each navigation. */
  readonly summary?: boolean;
  readonly title: ReactNode;
  readonly variants: ReadonlyArray<DemoVariant<TValue>>;
  /** What the variant switch picks, as a label. */
  readonly variantsLabel: string;
}) {
  const offered = props.only
    ? props.variants.filter((variant) =>
        props.only?.split(',').includes(variant.value),
      )
    : props.variants;
  const variants = offered.length > 0 ? offered : props.variants;
  const first =
    variants.find((variant) => variant.value === props.initial) ?? variants[0];
  if (!first) {
    throw new Error('A demo needs a variant');
  }
  const [variant, setVariant] = useState(first.value);
  const [latency, setLatency] = useState(initialLatency);
  const [run, setRun] = useState<Run>({
    id: 0,
    location: undefined,
    session: undefined,
  });
  const variantsLabel = useId();
  const latencyLabel = useId();
  const current =
    variants.find((candidate) => candidate.value === variant) ?? first;
  const origin = props.origin;
  const [onScreen, onScreenRef] = useOnScreen();
  const started = run.session !== undefined;

  useEffect(() => {
    if (onScreen && !started) {
      setRun(newRun(initialLatency, origin));
    }
  }, [onScreen, origin, started]);

  useEffect(() => {
    const network = run.session?.network;
    if (!network) {
      return;
    }
    if (onScreen) {
      network.resume();
    } else {
      network.pause();
    }
  }, [onScreen, run.session]);

  const demoRun: DemoRun<TValue> = {
    location: run.location,
    reload: (location) => setRun(newRun(latency, props.origin, location)),
    session: run.session,
    variant,
  };
  return (
    <figure
      className="not-prose my-8 grid gap-4 rounded-xl border bg-card p-4 text-card-foreground sm:p-5"
      ref={onScreenRef}
    >
      <figcaption className="grid gap-1">
        <span className="text-sm font-semibold">{props.title}</span>
        <span className="text-sm text-muted-foreground">{props.hint}</span>
      </figcaption>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        {variants.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span id={variantsLabel}>{props.variantsLabel}</span>
            <Segmented
              aria-labelledby={variantsLabel}
              onChange={(next) => {
                setVariant(next);
                setRun(newRun(latency, props.origin));
              }}
              options={variants}
              value={variant}
            />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <span id={latencyLabel}>Latency</span>
          <Segmented
            aria-labelledby={latencyLabel}
            onChange={(next) => {
              setLatency(Number(next));
              if (run.session) {
                run.session.network.latency = Number(next);
              }
            }}
            options={latencies.map((choice) => ({
              label: choice.label,
              value: String(choice.ms),
            }))}
            value={String(latency)}
          />
        </div>
      </div>
      <p className="text-sm">{current.description}</p>
      {run.session ? (
        <SessionProvider key={run.id} session={run.session}>
          {props.children(demoRun)}
        </SessionProvider>
      ) : (
        props.children(demoRun)
      )}
      <NetworkPanel
        network={run.session?.network ?? idleNetwork}
        playing={onScreen}
        summary={props.summary ?? true}
      />
    </figure>
  );
}
