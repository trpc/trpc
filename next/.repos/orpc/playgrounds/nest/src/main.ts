import './instrumentation'

import process from 'node:process'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  await app.listen(process.env.PORT ?? 3000)
  console.log(`Listening on http://localhost:${process.env.PORT ?? 3000}`)
}

await bootstrap()
