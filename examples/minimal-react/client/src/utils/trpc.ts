import type { AppRouter } from '@examples/minimal-server';
import { createTRPCReact } from '@trpc/react';

export const trpc = createTRPCReact<AppRouter>();
