import {
  type AnyRoute,
  createMemoryHistory,
  createRouter,
  RouterProvider,
  useCanGoBack,
  useLoaderData,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import { ArrowLeft, RotateCw } from 'lucide-react';
import {
  createContext,
  type MouseEvent,
  type ReactNode,
  use,
  useId,
  useState,
} from 'react';

import { Button } from '@shared/ui/components/button';

import type { Session, TRPC } from './session.tsx';

/** What a demo's route loaders get as `context`. */
export interface DemoContext {
  readonly trpc: TRPC;
}

const ReloadContext = createContext<(location: string) => void>(() => {});

function AddressBar() {
  const router = useRouter();
  const href = useRouterState({ select: (state) => state.location.href });
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const id = useId();
  return (
    <form
      className="min-w-0 flex-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft !== undefined) {
          void router.navigate({
            href: draft.startsWith('/') ? draft : `/${draft}`,
          });
        }
        setDraft(undefined);
      }}
    >
      <label className="sr-only" htmlFor={id}>
        Address
      </label>
      <input
        className="h-7 w-full rounded-md border bg-background px-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        id={id}
        onBlur={() => setDraft(undefined)}
        onChange={(event) => setDraft(event.target.value)}
        spellCheck={false}
        value={draft ?? href}
      />
    </form>
  );
}

function Chrome(props: { readonly children: ReactNode }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const reload = use(ReloadContext);
  const status = useRouterState({ select: (state) => state.status });
  const href = useRouterState({ select: (state) => state.location.href });
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="flex items-center gap-1 border-b bg-muted/60 px-2 py-1.5">
        <Button
          aria-label="Back"
          disabled={!canGoBack}
          onClick={() => router.history.back()}
          size="icon-xs"
          variant="ghost"
        >
          <ArrowLeft />
        </Button>
        <Button
          aria-label="Reload"
          onClick={() => reload(href)}
          size="icon-xs"
          variant="ghost"
        >
          <RotateCw />
        </Button>
        <AddressBar />
      </div>
      <div aria-hidden className="relative h-0.5 overflow-hidden">
        {status === 'pending' ? (
          <div className="absolute inset-0 bg-brand-dark motion-safe:animate-pulse dark:bg-brand-light" />
        ) : null}
      </div>
      <div className="min-h-56 p-4 text-sm">{props.children}</div>
    </div>
  );
}

/**
 * The loader data of the route rendering this component, as `TLoader`
 * returns it. The docs site registers its own router, so a demo's routes
 * can't be typed through `Route.useLoaderData()`.
 */
export function useDemoLoaderData<
  TLoader extends (...args: never[]) => unknown,
>() {
  return useLoaderData({ strict: false }) as Awaited<ReturnType<TLoader>>;
}

/** A link inside the demo's browser, which navigates its router. */
export function DemoLink(props: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly href: string;
}) {
  const router = useRouter();
  return (
    <a
      className={
        props.className ??
        'text-brand-dark underline-offset-2 hover:underline dark:text-brand-light'
      }
      href={props.href}
      onClick={(event: MouseEvent) => {
        event.preventDefault();
        void router.navigate({ href: props.href });
      }}
    >
      {props.children}
    </a>
  );
}

/**
 * A browser tab running `routeTree` on its own router and memory history,
 * with the session's tRPC proxy in the loaders' context. Every load starts a
 * new trace in the network panel.
 */
export function DemoBrowser(props: {
  readonly initial: string;
  readonly reload: (location: string) => void;
  readonly routeTree: AnyRoute;
  readonly session: Session;
}) {
  const [router] = useState(() => {
    const created = createRouter({
      context: { trpc: props.session.trpc } satisfies DemoContext,
      // On a page it has visited, TanStack Router shows the kept loader
      // data and reruns the loader behind it by default, which hides what
      // `$ensure` and `$fetch` wait for.
      defaultStaleReloadMode: 'blocking',
      history: createMemoryHistory({ initialEntries: [props.initial] }),
      InnerWrap: Chrome,
      routeTree: props.routeTree,
      // Otherwise each of the demo's navigations scrolls the real page to
      // the top: only a function turns that off.
      scrollRestoration: () => false,
    });
    const network = props.session.network;
    created.subscribe('onBeforeLoad', (event) =>
      network.begin(event.toLocation.href),
    );
    created.subscribe('onRendered', () => network.shown());
    return created;
  });
  return (
    <ReloadContext value={props.reload}>
      <RouterProvider router={router} />
    </ReloadContext>
  );
}
