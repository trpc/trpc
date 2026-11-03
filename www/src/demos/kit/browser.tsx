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

function AddressBar(props: {
  readonly href: string;
  readonly navigate: (href: string) => void;
}) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const id = useId();
  return (
    <form
      className="min-w-0 flex-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft !== undefined) {
          props.navigate(draft.startsWith('/') ? draft : `/${draft}`);
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
        value={draft ?? props.href}
      />
    </form>
  );
}

/** The tab's buttons, address bar and page. */
function Tab(props: {
  readonly back: () => void;
  readonly canGoBack: boolean;
  readonly children: ReactNode;
  readonly href: string;
  readonly navigate: (href: string) => void;
  readonly pending: boolean;
  readonly reload: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="flex items-center gap-1 border-b bg-muted/60 px-2 py-1.5">
        <Button
          aria-label="Back"
          disabled={!props.canGoBack}
          onClick={props.back}
          size="icon-xs"
          variant="ghost"
        >
          <ArrowLeft />
        </Button>
        <Button
          aria-label="Reload"
          onClick={props.reload}
          size="icon-xs"
          variant="ghost"
        >
          <RotateCw />
        </Button>
        <AddressBar href={props.href} navigate={props.navigate} />
      </div>
      <div aria-hidden className="relative h-0.5 overflow-hidden">
        {props.pending ? (
          <div className="absolute inset-0 bg-brand-dark motion-safe:animate-pulse dark:bg-brand-light" />
        ) : null}
      </div>
      <div className="min-h-56 p-4 text-sm">{props.children}</div>
    </div>
  );
}

function Chrome(props: { readonly children: ReactNode }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const reload = use(ReloadContext);
  const status = useRouterState({ select: (state) => state.status });
  const href = useRouterState({ select: (state) => state.location.href });
  return (
    <Tab
      back={() => router.history.back()}
      canGoBack={canGoBack}
      href={href}
      navigate={(next) => void router.navigate({ href: next })}
      pending={status === 'pending'}
      reload={() => reload(href)}
    >
      {props.children}
    </Tab>
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
  readonly 'aria-current'?: 'page' | undefined;
  readonly children: ReactNode;
  readonly className?: string;
  readonly href: string;
}) {
  const router = useRouter();
  return (
    <a
      aria-current={props['aria-current']}
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

function LiveBrowser(props: {
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

/**
 * A browser tab running `routeTree` on its own router and memory history,
 * with the session's tRPC proxy in the loaders' context. Every load starts a
 * new trace in the network panel. Until the demo starts its session, the tab
 * shows `initial` as `placeholder`, which is what the server renders.
 */
export function DemoBrowser(props: {
  readonly initial: string;
  readonly placeholder: ReactNode;
  readonly reload: (location: string) => void;
  readonly routeTree: AnyRoute;
  readonly session: Session | undefined;
}) {
  if (!props.session) {
    return (
      <Tab
        back={() => {}}
        canGoBack={false}
        href={props.initial}
        navigate={() => {}}
        pending={false}
        reload={() => {}}
      >
        {props.placeholder}
      </Tab>
    );
  }
  return (
    <LiveBrowser
      initial={props.initial}
      reload={props.reload}
      routeTree={props.routeTree}
      session={props.session}
    />
  );
}
