import type { Publisher } from '@orpc/publisher'
import { Module } from '@nestjs/common'
import { SmartCoercionHandlerPlugin } from '@orpc/json-schema'
import { ORPCModule } from '@orpc/nest'
import { ZodToJsonSchemaConverter } from '@orpc/zod'
import { messagePublisher } from './context'
import { FileController } from './controllers/file.controller'
import { MessageController } from './controllers/message.controller'
import { PlanetController } from './controllers/planet.controller'
import { SpecController } from './controllers/spec.controller'

declare module '@orpc/server' {
  /**
   * Extend the context interface to enable typesafe access across oRPC scopes
   */
  interface DefaultInitialContext {
    messagePublisher: Publisher<Record<string, { message: string }>>
  }
}

@Module({
  imports: [
    ORPCModule.forRoot({
      context: { messagePublisher },
      plugins: [
        new SmartCoercionHandlerPlugin({
          converters: [new ZodToJsonSchemaConverter()],
        }),
      ],
    }),
  ],
  controllers: [SpecController, PlanetController, FileController, MessageController],
  providers: [],
})
export class AppModule {}
