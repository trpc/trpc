import type { AppRouter } from '@monotest/api';
import { createTRPCClient, httpBatchLink } from '@trpc/client';

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
    }),
  ],
});

{
  const res = await client.router01.foo.query();

  console.log(res);
  //           ^?
}

{
  const res = await client.router01.child.grandchild.proc.query();
  console.log(res);
  //           ^?
}
