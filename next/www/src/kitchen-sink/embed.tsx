import { Skeleton } from '@shared/ui/components/skeleton';
import {
  type ComponentType,
  lazy,
  Suspense,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';

import type { DemoDefinition } from './define.ts';
import type { DemoId } from './demos.ts';

/** Each demo's definition, its files bundled as text: loaded with the frame. */
const definitions: Record<DemoId, () => Promise<{ default: DemoDefinition }>> =
  {
    files: () => import('./files.ts'),
    forms: () => import('./forms.ts'),
    optimistic: () => import('./optimistic.ts'),
  };

interface FrameProps {
  readonly className: string;
}

const frames = new Map<DemoId, ComponentType<FrameProps>>();

/**
 * The demo's frame, loaded on first use: the editor, the compiler and the
 * packages the demo imports stay out of the page's bundle.
 */
function frameOf(id: DemoId) {
  const existing = frames.get(id);
  if (existing) {
    return existing;
  }
  const frame = lazy(async () => {
    const [{ DemoFrame }, definition] = await Promise.all([
      import('./frame.tsx'),
      definitions[id](),
    ]);
    return {
      default: (props: FrameProps) => (
        <DemoFrame className={props.className} demo={definition.default} />
      ),
    };
  });
  frames.set(id, frame);
  return frame;
}

/** Tailwind's `xl`, where the page has room for the demo beside its text. */
const beside = '(min-width: 80rem)';

function useBeside() {
  return useSyncExternalStore(
    (onChange) => {
      const query = matchMedia(beside);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () => matchMedia(beside).matches,
    () => undefined,
  );
}

function Loading(props: { readonly className?: string }) {
  return (
    <div className={props.className}>
      <Skeleton className="h-full w-full rounded-xl" />
    </div>
  );
}

function Frame(props: { readonly className: string; readonly demo: DemoId }) {
  const DemoFrame = frameOf(props.demo);
  return (
    <Suspense fallback={<Loading className={props.className} />}>
      <DemoFrame className={props.className} />
    </Suspense>
  );
}

/**
 * Runs a page's demo: beside the text from `xl` up, in `aside`'s column,
 * and below that in place of the page's `demo` fence (its `data-demo`
 * element in `html`). Only in the browser: the prerendered page shows the
 * fence's text.
 */
export function PageDemo(props: {
  readonly demo: DemoId;
  /** The page's HTML, which holds the fence's element. */
  readonly html: string;
  readonly mode: 'aside' | 'inline';
}) {
  const wide = useBeside();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (props.mode !== 'inline') {
      return undefined;
    }
    const element = document.querySelector<HTMLElement>(
      `[data-demo="${props.demo}"]`,
    );
    setSlot(element);
    element?.setAttribute('data-demo-running', '');
    return () => element?.removeAttribute('data-demo-running');
  }, [props.demo, props.html, props.mode]);

  if (wide === undefined) {
    return props.mode === 'aside' ? <Loading className="h-full" /> : null;
  }
  if (props.mode === 'aside') {
    return wide ? <Frame className="h-full" demo={props.demo} /> : null;
  }
  return !wide && slot
    ? createPortal(
        <Frame className="h-[44rem] max-h-[85dvh]" demo={props.demo} />,
        slot,
      )
    : null;
}
