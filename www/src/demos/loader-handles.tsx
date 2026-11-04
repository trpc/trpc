import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Play,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { Button } from '@shared/ui/components/button';
import { cn } from '@shared/ui/lib/utils';

import type { DemoProps } from './names.ts';
import { Reserve } from './reserve.tsx';
import { useOnScreen, usePrefersReducedMotion } from './use-playback.ts';

const steps = [
  {
    text: 'Before the route renders, its loader calls unstable_$prefetch for the post and its comments. Both requests go out at once.',
    title: 'The loader starts both queries',
  },
  {
    text: "unstable_$prefetch doesn't wait. The loader returns a handle for each query, its key and input, and the route renders while the requests are in flight.",
    title: 'It returns handles right away',
  },
  {
    text: 'Post and Comments each get a handle and read it with trpc.unstable_$fromHandle(). Until their data arrives, they suspend and show their Suspense fallbacks.',
    title: 'Components read the handles',
  },
  {
    text: 'The responses fill the query cache, and the components render. Neither one named a procedure or rebuilt an input.',
    title: 'The data arrives',
  },
] as const;

const lastStep = steps.length - 1;

function describeStep(index: number) {
  const step = steps[index] ?? steps[0];
  return (
    <>
      <strong>
        {index + 1}. {step.title}.
      </strong>{' '}
      {step.text}
    </>
  );
}

/** Real milliseconds per step while playing. */
const stepDuration = 2200;

function Panel(props: {
  readonly active: boolean;
  readonly children: ReactNode;
  readonly title: string;
}) {
  return (
    <div
      className={cn(
        'grid content-start gap-2 rounded-lg border bg-background p-3 transition-shadow motion-reduce:transition-none',
        props.active && 'border-link shadow-[0_0_0_1px_var(--link)]',
      )}
    >
      <p className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
        {props.title}
      </p>
      {props.children}
    </div>
  );
}

function Connector(props: {
  readonly active: boolean;
  readonly label: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex items-center justify-center gap-1 text-[0.65rem] font-medium text-muted-foreground md:flex-col',
        props.active && 'text-link',
      )}
    >
      <ArrowDown className="size-4 md:hidden" />
      <ArrowRight className="hidden size-4 md:block" />
      {props.label}
    </div>
  );
}

function Handle(props: { readonly name: string; readonly shown: boolean }) {
  return (
    <span
      className={cn(
        'block rounded-md border border-dashed border-chart-2 bg-chart-2/10 px-2 py-1 font-mono text-[0.7rem] transition-[opacity,translate] duration-500 motion-reduce:transition-none',
        props.shown ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0',
      )}
    >
      {props.name}: {'{ queryKey, input }'}
    </span>
  );
}

function ReaderStatus(props: { readonly data: string; readonly step: number }) {
  return props.step < 1 ? (
    <p className="text-xs text-muted-foreground">Not rendered yet</p>
  ) : props.step < 2 ? (
    <p className="text-xs text-muted-foreground">Gets its handle</p>
  ) : props.step < 3 ? (
    <p className="text-xs text-muted-foreground italic">
      <span className="motion-safe:animate-pulse">Loading…</span> (suspended)
    </p>
  ) : (
    <p className="text-xs font-medium">{props.data}</p>
  );
}

function Reader(props: {
  readonly data: string;
  readonly jsx: string;
  readonly step: number;
}) {
  return (
    <div className="grid gap-1.5 rounded-md border p-2">
      <span className="font-mono text-[0.7rem]">{props.jsx}</span>
      <Reserve
        shapes={steps.map((_, index) => (
          <ReaderStatus data={props.data} key={index} step={index} />
        ))}
      >
        <ReaderStatus data={props.data} step={props.step} />
      </Reserve>
    </div>
  );
}

function Request(props: { readonly label: string; readonly step: number }) {
  const done = props.step === lastStep;
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_1rem] items-center gap-2">
      <span className="truncate font-mono text-xs">{props.label}</span>
      <div className="relative h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-brand-dark transition-[width] duration-700 motion-reduce:transition-none dark:bg-brand-light"
          style={{ width: `${((props.step + 1) / steps.length) * 100}%` }}
        />
      </div>
      {done ? (
        <Check aria-label="done" className="size-4 text-chart-5" />
      ) : (
        <span className="sr-only">in flight</span>
      )}
    </div>
  );
}

/**
 * A route loader starting two queries in parallel and handing their handles
 * to the components that read them, step by step.
 */
export function LoaderHandles(_props: DemoProps) {
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [seen, setSeen] = useState(false);
  const [onScreen, onScreenRef] = useOnScreen();

  // Off the screen, the current step waits.
  useEffect(() => {
    if (!playing || !onScreen) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setStep((current) => Math.min(lastStep, current + 1));
      if (step + 1 >= lastStep) {
        setPlaying(false);
      }
    }, stepDuration);
    return () => clearTimeout(timer);
  }, [onScreen, playing, step]);

  const play = useCallback(() => {
    setStep(0);
    setPlaying(true);
  }, []);
  useEffect(() => {
    if (onScreen && !seen) {
      setSeen(true);
      if (!reduced) {
        play();
      }
    }
  }, [onScreen, play, reduced, seen]);

  return (
    <figure
      className="not-prose my-8 grid gap-4 rounded-xl border bg-card p-4 text-card-foreground sm:p-5"
      ref={onScreenRef}
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Panel active={step === 0 || step === 1} title="Route loader">
          <pre className="overflow-x-auto font-mono text-[0.7rem] leading-relaxed">
            <span className="text-muted-foreground">
              {'loader: ({ params: { id } }) => ({'}
            </span>
            {'\n  post: trpc.post.byId\n    .unstable_$prefetch({ id }),'}
            {
              '\n  comments: trpc.post.comments\n    .unstable_$prefetchInfinite(…),'
            }
            <span className="text-muted-foreground">{'\n})'}</span>
          </pre>
        </Panel>
        <Connector active={step === 1} label="returns" />
        <Panel active={step === 1} title="Handles">
          <div className="grid *:col-start-1 *:row-start-1">
            <div className="grid gap-2">
              <Handle name="post" shown={step >= 1} />
              <Handle name="comments" shown={step >= 1} />
            </div>
            {step < 1 ? (
              <p className="text-xs text-muted-foreground">None yet</p>
            ) : null}
          </div>
        </Panel>
        <Connector active={step === 2} label="props" />
        <Panel active={step >= 2} title="Components">
          <Reader
            data="Hello, handles"
            jsx="<Post post={post} />"
            step={step}
          />
          <Reader
            data="3 comments"
            jsx="<Comments comments={comments} />"
            step={step}
          />
        </Panel>
      </div>

      <Panel active={step === 0 || step === lastStep} title="Requests">
        <Request label="post.byId" step={step} />
        <Request label="post.comments" step={step} />
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ol aria-label="Steps" className="flex gap-1.5">
          {steps.map((entry, index) => (
            <li key={entry.title}>
              <button
                aria-current={index === step ? 'step' : undefined}
                aria-label={`Step ${index + 1}: ${entry.title}`}
                className={cn(
                  'block size-2.5 rounded-full bg-muted-foreground/30 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  index === step && 'bg-link',
                )}
                onClick={() => {
                  setPlaying(false);
                  setStep(index);
                }}
                type="button"
              />
            </li>
          ))}
        </ol>
        <div className="flex gap-1.5">
          <Button
            aria-label="Previous step"
            disabled={step === 0}
            onClick={() => {
              setPlaying(false);
              setStep(step - 1);
            }}
            size="icon-sm"
            variant="outline"
          >
            <ChevronLeft />
          </Button>
          <Button
            aria-label="Next step"
            disabled={step === lastStep}
            onClick={() => {
              setPlaying(false);
              setStep(step + 1);
            }}
            size="icon-sm"
            variant="outline"
          >
            <ChevronRight />
          </Button>
          {reduced ? null : (
            <Button onClick={play} size="sm" variant="outline">
              <Play data-icon="inline-start" />
              {playing ? 'Restart' : 'Play'}
            </Button>
          )}
        </div>
      </div>

      <figcaption aria-live="polite" className="text-sm">
        <Reserve shapes={steps.map((_, index) => describeStep(index))}>
          {describeStep(step)}
        </Reserve>
      </figcaption>
    </figure>
  );
}
