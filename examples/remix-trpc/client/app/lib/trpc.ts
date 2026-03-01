// client/app/lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../../../server/src/trpc';

export const trpc = createTRPCReact<AppRouter>();
