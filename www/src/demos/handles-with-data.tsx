import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createTRPCOptionsProxy,
  type unstable_inferQueryHandle,
  type unstable_inferQueryHandleWithData,
} from '@trpc/tanstack-react-query';
import { Play, RotateCcw } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { Button } from '@shared/ui/components/button';

import { type AppRouter, createDemoClient } from './kit/backend.ts';
import { PostSkeleton } from './kit/blog.tsx';
import { type DemoRun, DemoFrame } from './kit/frame.tsx';
import { formatValue } from './kit/network.ts';
import {
  createQueryClient,
  staleTime,
  type TRPC,
  useTRPC,
} from './kit/session.tsx';
import type { DemoProps } from './names.ts';

type Verb = 'ensure' | 'prefetch';

type PostHandle = unstable_inferQueryHandle<TRPC['post']['byId']>;

type PostHandleWithData = unstable_inferQueryHandleWithData<
  TRPC['post']['byId']
>;

interface Render {
  readonly fetchStatus: string;
  readonly servedAt: number | undefined;
  readonly status: string;
}

const code = (text: string) => <span className="font-mono">{text}</span>;

function withData(handle: PostHandle) {
  return 'data' in handle ? (handle as PostHandleWithData) : undefined;
}

/** Shows the handle as the loader returned it. */
function HandleView(props: { readonly handle: PostHandle | undefined }) {
  if (!props.handle) {
    return <p className="text-muted-foreground">No handle yet.</p>;
  }
  const data = withData(props.handle)?.data;
  return (
    <pre className="rounded-md bg-muted p-2 font-mono text-[0.7rem] leading-relaxed whitespace-pre-wrap">
      {[
        '{',
        `  queryKey: ${formatValue(props.handle.queryKey)},`,
        `  input: ${formatValue(props.handle.input)},`,
        ...(data
          ? [
              `  data: { title: '${data.title}', servedAt: ${data.servedAt.toFixed(1)}, … },`,
            ]
          : ["  // no data: $prefetch doesn't wait for it"]),
        '}',
      ].join('\n')}
    </pre>
  );
}

function HandleAge(props: { readonly handle: PostHandle }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const updatedAt = withData(props.handle)?.dataUpdatedAt;
  if (updatedAt === undefined) {
    return null;
  }
  const age = (now - updatedAt) / 1000;
  return (
    <p className="text-xs text-muted-foreground">
      Its data is {age.toFixed(1)} s old:{' '}
      <span className="font-medium text-foreground">
        {age * 1000 < staleTime ? 'fresh' : 'stale'}
      </span>{' '}
      (stale after {staleTime / 1000} s).
    </p>
  );
}

/** The component under test: `useQuery` on the handle, no Suspense. */
function Post(props: {
  readonly onRender: (render: Render) => void;
  readonly post: PostHandle;
}) {
  const trpc = useTRPC();
  const postQuery = useQuery(trpc.unstable_$fromHandle(props.post));
  const last = useRef('');
  const render = {
    fetchStatus: postQuery.fetchStatus,
    servedAt: postQuery.data?.servedAt,
    status: postQuery.status,
  };
  const key = JSON.stringify(render);
  const onRender = props.onRender;
  useEffect(() => {
    if (key !== last.current) {
      last.current = key;
      onRender(JSON.parse(key) as Render);
    }
  }, [key, onRender]);
  switch (postQuery.status) {
    case 'pending':
      return <PostSkeleton />;
    case 'error':
      return <p className="text-destructive">{postQuery.error.message}</p>;
    case 'success':
      return (
        <article className="grid gap-1">
          <h3 className="text-base font-semibold">{postQuery.data.title}</h3>
          <p className="text-xs text-muted-foreground">
            Served at {postQuery.data.servedAt.toFixed(1)} s
          </p>
        </article>
      );
  }
}

function Panel(props: {
  readonly children: ReactNode;
  readonly title: string;
}) {
  return (
    <section className="grid content-start gap-2 rounded-lg border bg-background p-3 text-sm">
      <h3 className="text-xs font-medium text-muted-foreground">
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

function Scenario(props: { readonly run: DemoRun<Verb> }) {
  const network = props.run.session.network;
  const [server] = useState(() => {
    const queryClient = createQueryClient();
    const client = createDemoClient(network, 'loader');
    return createTRPCOptionsProxy<AppRouter>({ client, queryClient });
  });
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [handle, setHandle] = useState<PostHandle | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [renders, setRenders] = useState<ReadonlyArray<Render>>([]);
  const handleServedAt = handle ? withData(handle)?.data.servedAt : undefined;

  const runLoader = async () => {
    network.begin('the loader');
    setLoading(true);
    try {
      setHandle(
        props.run.variant === 'prefetch'
          ? server.post.byId.unstable_$prefetch({ id: 1 })
          : await server.post.byId.unstable_$ensure({ id: 1 }),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Panel title="Loader, on the server">
        <HandleView handle={handle} />
        {handle ? <HandleAge handle={handle} /> : null}
        <div>
          <Button
            disabled={handle !== undefined || loading}
            onClick={() => void runLoader()}
            size="sm"
          >
            <Play data-icon="inline-start" />
            Run the loader
          </Button>
        </div>
      </Panel>
      <Panel title="Browser, with an empty cache">
        <div className="min-h-16">
          {handle && rendered ? (
            <Post
              onRender={(render) =>
                setRenders((current) => [...current, render])
              }
              post={handle}
            />
          ) : (
            <p className="text-muted-foreground">
              {'<Post />'} hasn&apos;t rendered.
            </p>
          )}
        </div>
        <ol
          aria-label="Renders of Post"
          aria-live="polite"
          className="grid gap-1 font-mono text-[0.7rem]"
        >
          {renders.map((render, index) => (
            <li key={index}>
              {index + 1}. status: &apos;{render.status}&apos;, fetchStatus:
              &apos;{render.fetchStatus}&apos;, data:{' '}
              {render.servedAt === undefined
                ? 'undefined'
                : `served at ${render.servedAt.toFixed(1)} s${render.servedAt === handleServedAt ? ' (the handle’s)' : ' (the cache’s)'}`}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!handle || rendered}
            onClick={() =>
              void queryClient.fetchQuery({
                ...trpc.post.byId.queryOptions({ id: 1 }),
                staleTime: 0,
              })
            }
            size="sm"
            variant="outline"
          >
            Fetch a newer copy
          </Button>
          <Button
            disabled={!handle || rendered}
            onClick={() => setRendered(true)}
            size="sm"
          >
            Render {'<Post />'}
          </Button>
          <Button onClick={() => props.run.reload()} size="sm" variant="ghost">
            <RotateCcw data-icon="inline-start" />
            Start over
          </Button>
        </div>
      </Panel>
    </div>
  );
}

/** What `useQuery` gets from a handle, with and without its data. */
export function HandlesWithData(props: DemoProps) {
  return (
    <DemoFrame
      hint={`Run the loader, then render. Wait ${staleTime / 1000} seconds before you render to get a stale handle, or fetch a newer copy first to see the cache win.`}
      initial={props.options['variant']}
      only={props.options['variants']}
      origin="browser"
      summary={false}
      title={<>A handle&apos;s data and {code('useQuery')}</>}
      variants={[
        {
          description: (
            <>
              The handle carries the data. {code('useQuery')} gets it as{' '}
              {code('initialData')}, so it has data on its first render, unless
              the cache already has a copy.
            </>
          ),
          label: code('$ensure'),
          value: 'ensure',
        },
        {
          description: (
            <>
              The handle has no data. The browser&apos;s cache is empty, so{' '}
              {code('useQuery')} starts {code("'pending'")} and fetches.
            </>
          ),
          label: code('$prefetch'),
          value: 'prefetch',
        },
      ]}
      variantsLabel="The loader uses"
    >
      {(run) => <Scenario run={run} />}
    </DemoFrame>
  );
}
