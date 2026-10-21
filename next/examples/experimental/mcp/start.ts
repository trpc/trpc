import { main } from './client.ts';
import { listen } from './server.ts';

await using server = await listen();
await main(server.url);
