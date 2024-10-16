import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@server/app-router';

export const trpc = createTRPCReact<AppRouter>();
