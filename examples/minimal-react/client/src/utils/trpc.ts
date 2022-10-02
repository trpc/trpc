import { createTRPCReact } from '@trpc/react';
import type { AppRouter } from '~/server/index';

export const trpc = createTRPCReact<AppRouter>();
