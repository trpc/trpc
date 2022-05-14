import { createReactQueryHooks } from '@trpc/react';
import type { AppRouter } from '../functions/api/[[trpc]]';

export const trpc = createReactQueryHooks<AppRouter>();
