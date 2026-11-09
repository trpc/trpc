import { createFileRoute } from '@tanstack/react-router';
import {
  type QueryPromise,
  useMutation,
  useQuery,
  useQueryState,
} from '@trpc12/experimental-react';
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
import { Suspense, use } from 'react';
import type { Post } from '../server/router.ts';
import type { Trpc } from '../trpc.ts';

export const Route = createFileRoute('/')({
  loader: async (opts) => {
    // Starts the request; a navigation in the browser doesn't wait for it.
    const posts = opts.context.trpc.post.list.query();
    // The server waits, so the HTML and the dehydrated cache have the posts.
    if (import.meta.env.SSR) await posts;
  },
  component: Home,
});

function Home() {
  const trpc = Route.useRouteContext({ select: (context) => context.trpc });
  // The loader's promise: one promise per query, settled once it has data.
  const posts = trpc.post.list.query();
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>use() and Suspense</CardTitle>
          <CardDescription>
            <code>@trpc12/experimental-react</code> on TanStack Start: the
            loader starts the query, the component reads its promise.
          </CardDescription>
          <CardAction>
            <Fetching posts={posts} />
          </CardAction>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Spinner />}>
            <Posts posts={posts} />
          </Suspense>
        </CardContent>
        <CardFooter>
          <AddPost trpc={trpc} />
        </CardFooter>
      </Card>
    </main>
  );
}

function Posts(props: { posts: QueryPromise<Post[]> }) {
  const posts = use(useQuery(props.posts));
  return (
    <ul aria-label="Posts" className="flex flex-col gap-2">
      {posts.map((post) => (
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

function Fetching(props: { posts: Promise<unknown> }) {
  const state = useQueryState(props.posts);
  return state.isFetching ? <Badge variant="secondary">fetching</Badge> : null;
}

function AddPost(props: { trpc: Trpc }) {
  // The call resolves once post.list has refetched; `invalidates` narrows
  // standardLinks()' invalidateOnMutationLink, which would refetch every query.
  const add = useMutation(props.trpc.post.add, { invalidates: 'post.list' });
  return (
    <form
      className="flex w-full flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const title = new FormData(form).get('title');
        if (typeof title !== 'string' || !title.trim()) return;
        // A failure shows below, from add.error.
        void add.mutate({ title }).then(
          () => form.reset(),
          () => undefined,
        );
      }}
    >
      <div className="flex gap-2">
        <Input name="title" aria-label="Title" placeholder="New post" />
        <Button type="submit" disabled={add.isPending}>
          {add.isPending ? <Spinner /> : 'Add'}
        </Button>
      </div>
      {add.error && (
        <p role="alert" className="text-sm text-destructive">
          {add.error.message}
        </p>
      )}
    </form>
  );
}
