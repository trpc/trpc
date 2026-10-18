import { main } from './client.ts';
import { listen } from './server.ts';

// Two servers on one Redis, to show calls moving between instances.
await using a = await listen();
await using b = await listen();
await main(a.url, b.url);
