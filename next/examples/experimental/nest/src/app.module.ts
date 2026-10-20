import { Module } from '@nestjs/common';
import { TrpcModule } from '@trpc12/experimental-nest';
import { Effect, Layer } from 'effect';
import { Posts, PostsController, RequestCounter, type User } from './posts.ts';

let requests = 0;

@Module({
  imports: [
    TrpcModule.forRoot({
      createContext: (opts): { user: User | null } => {
        const name = opts.request.headers['x-user'];
        return { user: name ? { name, admin: name === 'admin' } : null };
      },
      layer: Layer.succeed(RequestCounter, {
        next: Effect.sync(() => ++requests),
      }),
    }),
  ],
  controllers: [PostsController],
  providers: [Posts],
})
export class AppModule {}
