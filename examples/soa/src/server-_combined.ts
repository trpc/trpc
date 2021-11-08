import * as trpc from '@trpc/server';
import * as server1 from './server-1';
import * as server2 from './server-2';

// this object is not actually used - we just use it to combine the two servers with different prefixes
const combinedServer = trpc
  .router<any>()
  .merge('server1.', server1.appRouter)
  .merge('server2.', server2.appRouter);

export type CombinedServer = typeof combinedServer;
