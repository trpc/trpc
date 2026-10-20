import { Button } from '@shared/ui/components/button';
import { cn } from '@shared/ui/lib/utils';
import { type AnyRouter, RouterProvider } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, ChevronRight, RotateCw } from 'lucide-react';
import {
  Component,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import type { DemoNetwork, DemoRequest } from './network.ts';

class AppBoundary extends Component<
  { readonly children: ReactNode; readonly onReload: () => void },
  { readonly error: unknown }
> {
  override state: { readonly error: unknown } = { error: undefined };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override render() {
    if (this.state.error === undefined) {
      return this.props.children;
    }
    return (
      <div className="grid gap-3 p-4 text-sm" role="alert">
        <p className="font-medium text-destructive">
          The app threw while it rendered.
        </p>
        <pre className="overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
          {this.state.error instanceof Error
            ? this.state.error.message
            : JSON.stringify(this.state.error)}
        </pre>
        <Button
          className="w-fit"
          onClick={this.props.onReload}
          size="sm"
          variant="outline"
        >
          Reload
        </Button>
      </div>
    );
  }
}

function useLocation(router: AnyRouter) {
  return useSyncExternalStore(
    router.history.subscribe,
    () => router.history.location.href,
    () => router.history.location.href,
  );
}

/**
 * The demo's app in a browser of its own: back, forward, reload and an
 * address bar over its router's memory history.
 */
export function DemoBrowser(props: {
  readonly onReload: () => void;
  readonly router: AnyRouter;
}) {
  const router = props.router;
  const href = useLocation(router);
  const [typed, setTyped] = useState<string>();
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-1 border-b bg-muted/40 px-2 py-1.5">
        <Button
          aria-label="Back"
          disabled={!router.history.canGoBack()}
          onClick={() => router.history.back()}
          size="icon-xs"
          variant="ghost"
        >
          <ArrowLeft />
        </Button>
        <Button
          aria-label="Forward"
          onClick={() => router.history.forward()}
          size="icon-xs"
          variant="ghost"
        >
          <ArrowRight />
        </Button>
        <Button
          aria-label="Reload the app"
          onClick={props.onReload}
          size="icon-xs"
          variant="ghost"
        >
          <RotateCw />
        </Button>
        <form
          className="min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (typed !== undefined) {
              router.history.push(typed.startsWith('/') ? typed : `/${typed}`);
              setTyped(undefined);
            }
          }}
        >
          <input
            aria-label="Address"
            className="h-6 w-full rounded-md border bg-background px-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            onBlur={() => setTyped(undefined)}
            onChange={(event) => setTyped(event.target.value)}
            spellCheck={false}
            value={typed ?? href}
          />
        </form>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <AppBoundary onReload={props.onReload}>
          <RouterProvider router={router} />
        </AppBoundary>
      </div>
    </div>
  );
}

function useRequests(network: DemoNetwork) {
  return useSyncExternalStore(
    network.subscribe,
    () => network.requests,
    () => network.requests,
  );
}

function statusOf(request: DemoRequest) {
  switch (request.outcome) {
    case 'pending':
      return request.status === undefined ? 'pending' : `${request.status} …`;
    case 'failed':
      return 'failed';
    case 'aborted':
      return 'aborted';
    case 'responded':
      return String(request.status);
  }
}

function RequestRow(props: { readonly request: DemoRequest }) {
  const request = props.request;
  const failed =
    request.outcome === 'failed' ||
    (request.status !== undefined && request.status >= 400);
  return (
    <details className="group border-b last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-1.5 font-mono text-xs hover:bg-muted/50">
        <ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        <span className="w-10 shrink-0 text-muted-foreground">
          {request.method}
        </span>
        {request.from === undefined ? null : (
          <span className="shrink-0 rounded bg-muted px-1 text-muted-foreground">
            {request.from}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{request.path}</span>
        <span
          className={cn(
            'shrink-0 tabular-nums',
            failed ? 'text-destructive' : 'text-muted-foreground',
            request.outcome === 'pending' && 'animate-pulse',
          )}
        >
          {statusOf(request)}
        </span>
        <span className="w-14 shrink-0 text-right text-muted-foreground tabular-nums">
          {request.endedAt === undefined
            ? ''
            : `${request.endedAt - request.startedAt} ms`}
        </span>
      </summary>
      <div className="grid gap-2 px-3 pb-3 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Request
          </p>
          {request.headers ? (
            <pre className="mb-1 max-h-24 overflow-auto rounded-md bg-muted p-2 font-mono text-xs text-muted-foreground">
              {request.headers}
            </pre>
          ) : null}
          <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-xs">
            {request.body ?? '(no body)'}
          </pre>
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Response
          </p>
          <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-xs">
            {request.response ?? '…'}
          </pre>
        </div>
      </div>
    </details>
  );
}

/** What went over the pretend network, latest at the bottom. */
export function DemoRequests(props: { readonly network: DemoNetwork }) {
  const requests = useRequests(props.network);
  const list = useRef<HTMLDivElement>(null);
  const latest = requests.at(-1)?.id;
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [latest]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
        <span>Requests</span>
        <span className="tabular-nums">{requests.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto" ref={list}>
        {requests.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            None yet: use the app.
          </p>
        ) : (
          requests.map((request) => (
            <RequestRow key={request.id} request={request} />
          ))
        )}
      </div>
    </div>
  );
}
