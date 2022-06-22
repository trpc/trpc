import { appRouter } from './__generated__/bigBoi2/_app';
import { createClient } from './wippy';

const client = createClient<typeof appRouter>();

{
  const res = client.r1999.grandchild.grandChildMut.mutation();
  //     ^?
}
{
  const res = client.r1999.grandchild.grandChildMut.mutation();
  //     ^?
}
