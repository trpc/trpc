import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  Link,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { rooms } from './rooms.ts';
import type { createTrpc } from './trpc.ts';

export interface RouterContext extends ReturnType<typeof createTrpc> {
  readonly queryClient: QueryClient;
  readonly user: string;
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Layout,
});

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/rooms/$room', params: { room: 'general' } });
  },
});

function Layout(): ReactNode {
  const link =
    'rounded-md px-2.5 py-1 text-sm text-muted-foreground hover:text-foreground data-[status=active]:bg-muted data-[status=active]:font-medium data-[status=active]:text-foreground';
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <nav className="flex gap-1 border-b pb-3">
        {rooms.map((room) => (
          <Link className={link} key={room} params={{ room }} to="/rooms/$room">
            #{room}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
