import {
  Component,
  type ComponentType,
  createElement,
  type ReactNode,
  Suspense,
  use,
} from 'react';

import {
  type DemoFence,
  type DemoName,
  type DemoProps,
  splitAtDemos,
} from './names.ts';
import { isChunkLoadError, reloadOnce, reloadPage } from '~/reload-once.ts';

type Demo = ComponentType<DemoProps>;

const imports: Record<DemoName, () => Promise<Demo>> = {
  'dependent-queries': async () =>
    (await import('./dependent-queries.tsx')).DependentQueries,
  'loader-handles': async () =>
    (await import('./loader-handles.tsx')).LoaderHandles,
  'request-timeline': async () =>
    (await import('./request-timeline.tsx')).RequestTimeline,
  'starting-queries': async () =>
    (await import('./starting-queries.tsx')).StartingQueries,
  'url-input': async () => (await import('./url-input.tsx')).UrlInput,
  waterfalls: async () => (await import('./waterfalls.tsx')).Waterfalls,
};

const loading = new Map<DemoName, Promise<Demo>>();

/**
 * Marks `promise` with how it settled: `use()` reads a settled promise's
 * `status`, so a demo whose code a loader has already waited for renders
 * without suspending. The handlers return nothing: returning `promise`
 * would make the promise `then` returns reject too, with no one to handle
 * it.
 */
export function withStatus<T>(promise: Promise<T>) {
  promise.then(
    (value) => {
      void Object.assign(promise, { status: 'fulfilled', value });
    },
    (reason: unknown) => {
      void Object.assign(promise, { reason, status: 'rejected' });
    },
  );
  return promise;
}

function load(name: DemoName) {
  let promise = loading.get(name);
  if (!promise) {
    promise = withStatus(imports[name]());
    loading.set(name, promise);
  }
  return promise;
}

/**
 * Loads the code of the demos in a page's HTML. A route's loader waits for
 * it, so the server renders the demos into the page and a client-side
 * navigation shows them at once. Pages without demos load none of it. A demo
 * whose code fails to load throws when it renders, so `DemoBoundary` hides it
 * and the page still loads.
 */
export async function loadPageDemos(html: string) {
  await Promise.all(
    splitAtDemos(html).flatMap((part) =>
      typeof part === 'string' ? [] : [load(part.name).catch(() => {})],
    ),
  );
}

function LoadedDemo(props: DemoFence) {
  // The same component on every render, once loaded.
  const demo = use(load(props.name));
  return createElement(demo, { options: props.options });
}

/**
 * A demo that throws renders nothing, and the rest of the page keeps working.
 * One whose chunk a deploy replaced reloads the page once, as a route does
 * (`components/error-page.tsx`), which brings it back.
 */
export class DemoBoundary extends Component<
  { readonly children: ReactNode },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error('A demo failed', error);
    if (isChunkLoadError(error)) {
      reloadOnce(`route:${window.location.pathname}`, reloadPage);
    }
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * A demo where its page's `demo` fence was. While the page hydrates before
 * the demo's code has loaded, it keeps the server's HTML until it has.
 */
export function PageDemo(props: DemoFence) {
  return (
    <DemoBoundary>
      <Suspense fallback={null}>
        <LoadedDemo name={props.name} options={props.options} />
      </Suspense>
    </DemoBoundary>
  );
}
