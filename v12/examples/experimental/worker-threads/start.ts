import { Worker } from 'node:worker_threads';
import { main } from './client.ts';

// The server is a worker thread, not a port: start it, and hand its port to the client.
await using worker = new Worker(new URL('./server.ts', import.meta.url));
await main(worker);
