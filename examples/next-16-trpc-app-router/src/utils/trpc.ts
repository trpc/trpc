import type { AppRouter } from '@/src/server/routers/app';
import { createTRPCReact } from '@trpc/react-query';

export const trpc = createTRPCReact<AppRouter>();
