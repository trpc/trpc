import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.ts';

const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
app.enableShutdownHooks();
await app.listen(Number(process.env['PORT'] ?? 3000), '127.0.0.1');
console.log(`listening on ${await app.getUrl()}`);
