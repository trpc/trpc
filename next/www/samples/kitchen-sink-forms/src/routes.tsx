import { Skeleton } from '@shared/ui/components/skeleton';
import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  Link,
  Outlet,
} from '@tanstack/react-router';
import { Suspense, type ReactNode } from 'react';

import { ensure, prefetch, useLoaderQuery } from './loader-query.ts';
import type { createTrpc } from './trpc.ts';

export interface RouterContext extends ReturnType<typeof createTrpc> {
  readonly queryClient: QueryClient;
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Layout,
});

function Layout(): ReactNode {
  const link =
    'rounded-md px-2.5 py-1 text-sm text-muted-foreground hover:text-foreground data-[status=active]:bg-muted data-[status=active]:font-medium data-[status=active]:text-foreground';
  return (
    <div className="grid gap-4">
      <nav className="flex gap-1 border-b pb-3">
        <Link activeOptions={{ exact: true }} className={link} to="/">
          Profile
        </Link>
        <Link className={link} to="/edit">
          Edit profile
        </Link>
      </nav>
      <Outlet />
    </div>
  );
}

// #region profile-route
export const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: async (opts) => {
    const ctx = opts.context;
    // Starts now and isn't waited for: <Changes> suspends until it arrives.
    const changes = prefetch(
      ctx.queryClient,
      ctx.trpc.profile.changes.queryOptions(),
    );
    // The page waits for the profile, so it renders with it.
    const profile = await ensure(
      ctx.queryClient,
      ctx.trpc.profile.get.queryOptions(),
    );
    return { changes, profile };
  },
  component: ProfilePage,
});

function ProfilePage(): ReactNode {
  const data = profileRoute.useLoaderData();
  const profile = useLoaderQuery(data.profile);
  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-full bg-brand/15 text-lg font-semibold text-brand">
          {profile.name.charAt(0)}
        </span>
        <div className="grid">
          <span className="font-semibold">{profile.name}</span>
          <span className="text-sm text-muted-foreground">
            @{profile.username} · {profile.email}
          </span>
        </div>
      </div>
      <p className="text-sm">{profile.bio}</p>
      <Suspense fallback={<Skeleton className="h-16 w-full" />}>
        <Changes />
      </Suspense>
    </div>
  );
}
// #endregion profile-route

function Changes(): ReactNode {
  const changes = useLoaderQuery(profileRoute.useLoaderData().changes);
  if (changes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No changes yet. Edit the profile to make some.
      </p>
    );
  }
  return (
    <section className="grid gap-1.5">
      <h3 className="text-xs font-medium text-muted-foreground">
        Recent changes
      </h3>
      <ul className="grid gap-1 text-sm">
        {changes.map((change) => (
          <li key={`${change.at}-${change.field}`}>
            <span className="font-medium">{change.field}</span>:{' '}
            <span className="text-muted-foreground line-through">
              {change.from || '(empty)'}
            </span>{' '}
            → {change.to || '(empty)'}
          </li>
        ))}
      </ul>
    </section>
  );
}
