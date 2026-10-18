/** `pnpm start`: the client's calls against each server in turn. */
import { main } from './client.ts';
import { listen, serverKinds } from './server.ts';

for (const kind of serverKinds) {
  await using server = await listen(0, kind);
  console.log(`${kind}:`);
  await main(server.url);
}
