import { useAtomSet, useAtomSuspense, useAtomValue } from '@effect/atom-react';
import { useQuery, useQueryState } from '@trpc12/experimental-react';
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
import { AsyncResult } from 'effect/reactivity';
import { Suspense, use } from 'react';
import { useFormStatus } from 'react-dom';
import type { Post } from '../server.ts';
import type { Clients, PageData } from './trpc.ts';

export function App(props: { clients: Clients; page: PageData }) {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">React without TanStack Query</h1>
        <p className="text-muted-foreground">
          The same router read two experimental ways. Each side keeps its own
          cache, so a post added on one side shows up there.
        </p>
      </header>
      <div className="grid gap-6 md:grid-cols-2">
        <SuspenseCard trpc={props.clients.trpc} posts={props.page.posts} />
        <AtomCard atoms={props.clients.atoms} />
      </div>
    </main>
  );
}

function SuspenseCard(props: {
  trpc: Clients['trpc'];
  posts: PageData['posts'];
}) {
  return (
    <Card data-testid="suspense">
      <CardHeader>
        <CardTitle>use() and Suspense</CardTitle>
        <CardDescription>
          <code>@trpc12/experimental-react</code>: the loader starts the query;
          the component reads its promise.
        </CardDescription>
        <CardAction>
          <Fetching posts={props.posts} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<Spinner />}>
          <SuspensePosts posts={props.posts} />
        </Suspense>
      </CardContent>
      <CardFooter>
        {/* invalidateOnMutationLink refetches the list before this resolves. */}
        <AddPost
          label="Title (use)"
          onAdd={(title) => props.trpc.post.add.mutate({ title })}
        />
      </CardFooter>
    </Card>
  );
}

function SuspensePosts(props: { posts: PageData['posts'] }) {
  return <PostList posts={use(useQuery(props.posts))} />;
}

function Fetching(props: { posts: PageData['posts'] }) {
  const state = useQueryState(props.posts);
  return state.isFetching ? <Badge variant="secondary">fetching</Badge> : null;
}

function AtomCard(props: { atoms: Clients['atoms'] }) {
  const add = useAtomSet(props.atoms.post.add.mutation(), { mode: 'promise' });
  return (
    <Card data-testid="atoms">
      <CardHeader>
        <CardTitle>Atoms</CardTitle>
        <CardDescription>
          <code>@trpc12/experimental-react-atom</code>: each query is an atom; a
          mutation refetches the atoms with its reactivity keys.
        </CardDescription>
        <CardAction>
          <Clock atoms={props.atoms} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<Spinner />}>
          <AtomPosts atoms={props.atoms} />
        </Suspense>
      </CardContent>
      <CardFooter>
        <AddPost
          label="Title (atoms)"
          onAdd={(title) =>
            add({ input: { title }, reactivityKeys: ['posts'] })
          }
        />
      </CardFooter>
    </Card>
  );
}

function AtomPosts(props: { atoms: Clients['atoms'] }) {
  const result = useAtomSuspense(
    props.atoms.post.list.query(undefined, { reactivityKeys: ['posts'] }),
  );
  return <PostList posts={result.value} />;
}

function Clock(props: { atoms: Clients['atoms'] }) {
  const result = useAtomValue(props.atoms.clock.subscription(undefined));
  if (!AsyncResult.isSuccess(result)) return <Spinner />;
  return (
    <Badge variant="outline" data-testid="clock">
      tick {result.value.tick}
    </Badge>
  );
}

function PostList(props: { posts: ReadonlyArray<Post> }) {
  return (
    <ul className="flex flex-col gap-2">
      {props.posts.map((post) => (
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

function AddPost(props: {
  label: string;
  onAdd: (title: string) => Promise<unknown>;
}) {
  return (
    <form
      className="flex w-full gap-2"
      action={async (data) => {
        const title = data.get('title');
        if (typeof title === 'string' && title.trim()) await props.onAdd(title);
      }}
    >
      <Input name="title" aria-label={props.label} placeholder="New post" />
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
