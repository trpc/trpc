import { client } from './client';

{
  const result = await client.serverA.greet.query('tRPC');

  console.log(result.greeting);
  //                  ^?
}
{
  const result = await client.serverB.foo.query();

  console.log({ result });
  //             ^?
}
