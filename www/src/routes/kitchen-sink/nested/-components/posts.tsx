import { Skeleton } from '@shared/ui/components/skeleton';
import { Component, type ReactNode, Suspense, use } from 'react';

import type { Author, Posts, Team } from '../-trpc.ts';

/**
 * The posts, as soon as `post.list` is back. Each author and team is a
 * promise of its own, so each shows when its query is done.
 */
export function PostList(props: { readonly posts: Promise<Posts> }) {
  const posts = use(props.posts);
  return (
    <ul className="grid gap-3">
      {posts.map((post) => (
        <li
          className="grid gap-2 rounded-xl bg-card p-4 shadow-sm ring-1 ring-foreground/10 motion-safe:animate-nested-pop"
          key={post.node.slug}
        >
          <span className="font-medium">{post.node.title}</span>
          <Failed fallback="The author didn't load.">
            <Suspense fallback={<Skeleton className="h-6 w-40" />}>
              <AuthorLine author={post.edges.author} />
            </Suspense>
          </Failed>
        </li>
      ))}
    </ul>
  );
}

function AuthorLine(props: { readonly author: Promise<Author> }) {
  const author = use(props.author);
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm motion-safe:animate-nested-pop">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-sky-500" />
        {author.node.name}
      </span>
      <Failed fallback="The team didn't load.">
        <Suspense fallback={<Skeleton className="h-5 w-20" />}>
          <TeamName team={author.edges.team} />
        </Suspense>
      </Failed>
    </span>
  );
}

function TeamName(props: { readonly team: Promise<Team> }) {
  const team = use(props.team);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 motion-safe:animate-nested-pop dark:text-amber-300">
      <span className="size-1.5 rounded-full bg-amber-500" />
      {team.name}
    </span>
  );
}

export function PostsSkeleton() {
  return (
    <div className="grid gap-3">
      {[0, 1, 2].map((i) => (
        <Skeleton className="h-20 w-full rounded-xl" key={i} />
      ))}
    </div>
  );
}

/**
 * Shows `fallback` in place of what it holds, if that throws: a query that
 * rejects. A new load has a new key above it, so it starts over.
 */
export class Failed extends Component<
  { readonly children: ReactNode; readonly fallback: string },
  { readonly failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <span className="text-sm text-destructive">{this.props.fallback}</span>
    ) : (
      this.props.children
    );
  }
}
