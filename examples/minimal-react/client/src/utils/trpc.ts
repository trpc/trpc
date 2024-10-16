import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from 'examples-minimal-react-server';

export const trpc = createTRPCReact<AppRouter>();
