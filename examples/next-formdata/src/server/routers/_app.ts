import { router } from '../trpc';
import { roomRouter } from './room';

export const appRouter = router({
  room: roomRouter,
});

// export only the type definition of the API
// None of the actual implementation is exposed to the client
export type AppRouter = typeof appRouter;
