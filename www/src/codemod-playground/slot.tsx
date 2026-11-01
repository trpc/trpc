import { Skeleton } from '@shared/ui/components/skeleton';
import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// The codemod and Oxc's WebAssembly parser load with the playground, and only
// in the browser: the server bundle never includes them.
const Playground = import.meta.env.SSR
  ? () => null
  : lazy(async () => ({
      default: (await import('./playground.tsx')).CodemodPlayground,
    }));

/**
 * Runs the playground in place of the page's `codemod-playground` fence (its
 * `data-codemod-playground` element in `html`). Only in the browser: the
 * prerendered page shows the fence's text.
 */
export function CodemodPlaygroundSlot(props: {
  /** The page's HTML, which may hold the fence's element. */
  readonly html: string;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const element = document.querySelector<HTMLElement>(
      '[data-codemod-playground]',
    );
    setSlot(element);
    element?.setAttribute('data-codemod-playground-running', '');
    return () => element?.removeAttribute('data-codemod-playground-running');
  }, [props.html]);

  return slot
    ? createPortal(
        <Suspense
          fallback={<Skeleton className="h-[28rem] w-full rounded-xl" />}
        >
          <Playground />
        </Suspense>,
        slot,
      )
    : null;
}
