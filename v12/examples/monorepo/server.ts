/** Serves `@acme/server`'s handler; the apps take `AppRouter` from `@acme/api`. */
import { startServer } from '@acme/server';

export async function listen(port = 0) {
  const server = await startServer(port);
  return { url: server.url, [Symbol.asyncDispose]: server.close };
}

if (import.meta.main) {
  const server = await listen(Number(process.env['PORT'] ?? 3000));
  console.log(server.url);
}
