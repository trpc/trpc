import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type * as Modules from './src/app.module.ts';
import type { appContract } from './src/contract.ts';

export type AppRouter = typeof appContract;

// Nest's modules use decorators, which Node's type stripping can't run, so
// `pnpm build` compiles them to dist/.
const modules = (await import(
  new URL('./dist/app.module.js', import.meta.url).href
)) as typeof Modules;

export async function listen(port = 0) {
  const app = await NestFactory.create(modules.AppModule, {
    logger: ['error', 'warn'],
  });
  await app.listen(port, '127.0.0.1');
  return {
    // The contract's REST routes are at the root, so the client points there.
    url: await app.getUrl(),
    [Symbol.asyncDispose]: () => app.close(),
  };
}

if (import.meta.main) {
  const server = await listen(Number(process.env['PORT'] ?? 3000));
  console.log(`listening on ${server.url}`);
}
