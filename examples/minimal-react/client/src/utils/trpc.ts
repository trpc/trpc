import { createTRPCReact } from '@trpc/react';
import type { AppRouter } from '../../../server';

export const trpc = createTRPCReact<AppRouter>();
