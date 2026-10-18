import { useAtomSet, useAtomSuspense, useAtomValue } from '@effect/atom-react';
import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { Badge } from '@shared/ui/components/badge';
import { Button } from '@shared/ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@shared/ui/components/card';
import { Input } from '@shared/ui/components/input';
import { Spinner } from '@shared/ui/components/spinner';
import { Effect } from 'effect';
import { AsyncResult, AtomRegistry } from 'effect/reactivity';
import { Suspense } from 'react';
import { useFormStatus } from 'react-dom';
import { type Atoms, postList } from '../trpc.ts';

export const Route = createFileRoute('/')({
  loader: async (opts) => {
    const atoms = opts.context.atoms;
    // The server waits for the list, so the HTML and the dehydrated registry
    // have it; in the browser the component suspends on the atom instead.
    if (import.meta.env.SSR) {
      const posts = postList(atoms.trpc);
      // Mounted for the request's registry, so it's still there when the
      // router dehydrates after the render.
      atoms.registry.mount(posts);
      await Effect.runPromise(AtomRegistry.getResult(atoms.registry, posts));
    }
  },
  component: Home,
});

function Home() {
  const trpc = Route.useRouteContext({
    select: (context) => context.atoms.trpc,
  });
  const add = useAtomSet(trpc.post.add.mutation(), { mode: 'promise' });
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Effect atoms</CardTitle>
          <CardDescription>
            <code>@trpc12/experimental-react-atom</code> on TanStack Start: each
            query is an atom; a mutation refetches the atoms with its reactivity
            keys.
          </CardDescription>
          <CardAction>
            {/* A subscription never settles, so only the browser opens it. */}
            <ClientOnly fallback={<Spinner />}>
              <Clock trpc={trpc} />
            </ClientOnly>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Spinner />}>
            <Posts trpc={trpc} />
          </Suspense>
        </CardContent>
        <CardFooter>
          <AddPost
            onAdd={(title) =>
              add({ input: { title }, reactivityKeys: ['posts'] })
            }
          />
        </CardFooter>
      </Card>
    </main>
  );
}

function Posts(props: { trpc: Atoms['trpc'] }) {
  const result = useAtomSuspense(postList(props.trpc));
  return (
    <ul aria-label="Posts" className="flex flex-col gap-2">
      {result.value.map((post) => (
        <li key={post.id} className="flex items-baseline justify-between gap-4">
          <span>{post.title}</span>
          <time className="text-xs text-muted-foreground">
            {post.createdAt.toISOString().slice(0, 10)}
          </time>
        </li>
      ))}
    </ul>
  );
}

function Clock(props: { trpc: Atoms['trpc'] }) {
  const result = useAtomValue(props.trpc.clock.subscription(undefined));
  if (!AsyncResult.isSuccess(result)) return <Spinner />;
  return (
    <Badge variant="outline" aria-label="Clock">
      tick {result.value.tick}
    </Badge>
  );
}

function AddPost(props: { onAdd: (title: string) => Promise<unknown> }) {
  return (
    <form
      className="flex w-full gap-2"
      action={async (data) => {
        const title = data.get('title');
        if (typeof title === 'string' && title.trim()) await props.onAdd(title);
      }}
    >
      <Input name="title" aria-label="Title" placeholder="New post" />
      <Submit />
    </form>
  );
}

function Submit() {
  const status = useFormStatus();
  return (
    <Button type="submit" disabled={status.pending}>
      {status.pending ? <Spinner /> : 'Add'}
    </Button>
  );
}
