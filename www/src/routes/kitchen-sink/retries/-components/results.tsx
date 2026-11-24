import { Skeleton } from '@shared/ui/components/skeleton';
import { Component, type ReactNode, Suspense, use } from 'react';

import type { Loaded } from '../-trpc.ts';

/** Shows what a query failed with, in place of what it would show */
class Failed extends Component<
  { readonly children: ReactNode },
  { readonly error: Error | null }
> {
  override state: { readonly error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    return this.state.error ? (
      <span className="text-sm text-destructive">
        ❌ {this.state.error.message}
      </span>
    ) : (
      this.props.children
    );
  }
}

/** The run of the server that answered: 1 if it answered at once */
function Run(props: { readonly run: number }) {
  return (
    <span
      className={
        props.run > 1
          ? 'rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-[11px] text-amber-700 dark:text-amber-300'
          : 'rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground'
      }
      title="The server's run that answered: more than 1 means it was retried"
    >
      run {props.run}
    </span>
  );
}

function Value<TValue extends { readonly run: number }>(props: {
  readonly render: (value: TValue) => ReactNode;
  readonly value: Promise<TValue>;
}) {
  const value = use(props.value);
  return (
    <span className="inline-flex items-center gap-2 motion-safe:animate-arrive">
      ✅ {props.render(value)} <Run run={value.run} />
    </span>
  );
}

/** One query's line: its name, then its data or its error, when it settles */
function Line<TValue extends { readonly run: number }>(props: {
  readonly name: string;
  readonly render: (value: TValue) => ReactNode;
  readonly value: Promise<TValue>;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 text-sm">
      <code className="w-28 shrink-0 font-mono text-xs text-muted-foreground">
        {props.name}
      </code>
      <Failed>
        <Suspense fallback={<Skeleton className="h-5 w-32" />}>
          <Value render={props.render} value={props.value} />
        </Suspense>
      </Failed>
    </li>
  );
}

function Comments(props: { readonly comments: Loaded['comments'] }) {
  const rows = use(props.comments);
  return (
    <ul className="grid gap-2">
      {rows.map((row, index) => (
        <li
          className="grid gap-1 rounded-lg bg-muted/40 p-2"
          // The comments are in the post's order, and never move
          key={index}
        >
          <ul className="grid gap-1">
            <Line
              name="user.byId"
              render={(user) => user.name}
              value={row.commenter}
            />
            <Line
              name="avatar.byId"
              render={(avatar) => avatar.emoji}
              value={row.avatar}
            />
          </ul>
        </li>
      ))}
    </ul>
  );
}

/** Every query of the load, each as it settles */
export function Results(props: { readonly loaded: Loaded }) {
  const { loaded } = props;
  return (
    <div className="grid gap-3 rounded-xl bg-card p-4 shadow-sm ring-1 ring-foreground/10">
      <ul className="grid gap-1.5">
        <Line
          name="post.bySlug"
          render={(post) => post.title}
          value={loaded.post}
        />
        <Line
          name="author.byId"
          render={(author) => author.name}
          value={loaded.author}
        />
        <Line
          name="team.byId"
          render={(team) => team.name}
          value={loaded.team}
        />
      </ul>
      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          For each comment: its commenter, and the commenter's avatar
        </span>
        <Failed>
          <Suspense fallback={<Skeleton className="h-24 w-full" />}>
            <Comments comments={loaded.comments} />
          </Suspense>
        </Failed>
      </div>
    </div>
  );
}
