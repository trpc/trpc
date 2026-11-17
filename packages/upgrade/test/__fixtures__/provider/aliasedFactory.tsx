import { createTRPCReact as createReact } from '@trpc/react-query';
import type { AppRouter } from './basic.trpc';

// The setup migrates when the factory is imported under another name
export const trpc = createReact<AppRouter>();
