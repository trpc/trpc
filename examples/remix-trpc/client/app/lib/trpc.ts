// client/app/lib/trpc.ts
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../../../server/src/trpc'; // 絶対パスが無理ならこの相対パスでOK

export const trpc = createTRPCReact<AppRouter>();
