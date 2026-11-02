import {
  Component,
  type ComponentType,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { type DemoName, type DemoProps, isDemoName } from './names.ts';

const demos: Record<DemoName, ComponentType<DemoProps>> = {
  'handles-with-data': lazy(() =>
    import('./handles-with-data.tsx').then((module) => ({
      default: module.HandlesWithData,
    })),
  ),
  'loader-handles': lazy(() =>
    import('./loader-handles.tsx').then((module) => ({
      default: module.LoaderHandles,
    })),
  ),
  'request-timeline': lazy(() =>
    import('./request-timeline.tsx').then((module) => ({
      default: module.RequestTimeline,
    })),
  ),
  'starting-queries': lazy(() =>
    import('./starting-queries.tsx').then((module) => ({
      default: module.StartingQueries,
    })),
  ),
  'url-input': lazy(() =>
    import('./url-input.tsx').then((module) => ({
      default: module.UrlInput,
    })),
  ),
  waterfalls: lazy(() =>
    import('./waterfalls.tsx').then((module) => ({
      default: module.Waterfalls,
    })),
  ),
};

interface Slot {
  readonly container: HTMLElement;
  readonly element: HTMLElement;
  readonly name: DemoName;
}

/**
 * A demo that throws renders nothing, so its slot keeps its static content
 * and the rest of the page keeps working.
 */
class DemoBoundary extends Component<
  { readonly children: ReactNode },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error('A demo failed', error);
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Hides the slot's static content once its demo has loaded and rendered. */
function MarkReady(props: { readonly element: HTMLElement }) {
  useLayoutEffect(() => {
    props.element.setAttribute('data-demo-ready', '');
    return () => props.element.removeAttribute('data-demo-ready');
  }, [props.element]);
  return null;
}

/**
 * Mounts the demos a page's HTML has slots for (`names.ts`), in the browser
 * only and as each slot comes near the screen, so a page's first paint, and
 * pages without demos, load none of their code.
 */
export function PageDemos(props: { readonly html: string }) {
  const [slots, setSlots] = useState<ReadonlyArray<Slot>>([]);

  useEffect(() => {
    const created: Array<HTMLElement> = [];
    const observer = new IntersectionObserver(
      (entries) => {
        const mounted: Array<Slot> = [];
        for (const entry of entries) {
          const element = entry.target;
          const name = element.getAttribute('data-demo');
          if (
            !entry.isIntersecting ||
            !(element instanceof HTMLElement) ||
            name === null ||
            !isDemoName(name)
          ) {
            continue;
          }
          observer.unobserve(element);
          const container = document.createElement('div');
          container.setAttribute('data-demo-root', '');
          element.append(container);
          created.push(container);
          mounted.push({ container, element, name });
        }
        if (mounted.length > 0) {
          setSlots((current) => [...current, ...mounted]);
        }
      },
      { rootMargin: '800px 0px' },
    );
    for (const element of document.querySelectorAll('article [data-demo]')) {
      observer.observe(element);
    }
    return () => {
      observer.disconnect();
      for (const container of created) {
        container.remove();
      }
      setSlots([]);
    };
  }, [props.html]);

  // Slots are only ever appended, so their index is a stable key.
  return slots.map((slot, index) => {
    const Demo = demos[slot.name];
    return createPortal(
      <DemoBoundary>
        <Suspense fallback={null}>
          <Demo options={{ ...slot.element.dataset }} />
          <MarkReady element={slot.element} />
        </Suspense>
      </DemoBoundary>,
      slot.container,
      String(index),
    );
  });
}
