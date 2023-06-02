import { createTRPCReact } from '@trpc/react-query';
import { AppRouter } from '~/app/api/trpc/router';

export const api = createTRPCReact<
  AppRouter,
  unknown,
  'ExperimentalSuspense'
>();
