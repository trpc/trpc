'use client';

import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from './basic.trpc';

export const trpc = createTRPCReact<AppRouter>();
