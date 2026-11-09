import {
  type CanActivate,
  Controller,
  type ExecutionContext,
  Inject,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { initTrpc } from '@trpc12/trpc/server';
import { experimental_openapi } from '@trpc12/trpc/openapi';
import { Implement } from '@trpc12/experimental-nest';
import { Context, Effect } from 'effect';
import { appContract, type Post } from './contract.ts';

export interface User {
  name: string;
  admin: boolean;
}

export class RequestCounter extends Context.Service<
  RequestCounter,
  { readonly next: Effect.Effect<number> }
>()('RequestCounter') {}

const t = initTrpc<{ ctx: { user: User | null } }>().concat(
  experimental_openapi(),
);
const impl = t.implement(appContract);

@Injectable()
export class Posts {
  readonly #posts = new Map<string, Post>([
    ['1', { id: '1', title: 'Served by Nest' }],
  ]);
  all() {
    return [...this.#posts.values()];
  }
  find(id: string) {
    return this.#posts.get(id);
  }
  add(title: string) {
    const post: Post = { id: String(this.#posts.size + 1), title };
    this.#posts.set(post.id, post);
    return post;
  }
}

@Injectable()
class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    return req.headers['x-user'] === 'admin';
  }
}

@Controller()
export class PostsController {
  readonly #posts: Posts;
  constructor(@Inject(Posts) posts: Posts) {
    this.#posts = posts;
  }

  @Implement(appContract.health)
  health() {
    return impl.health.query(() => 'ok' as const);
  }

  // A router: one method adds a Nest route for every procedure below it.
  @Implement(appContract.post)
  post() {
    return {
      list: impl.post.list.query(() => this.#posts.all()),
      byId: impl.post.byId.query(
        (opts) =>
          this.#posts.find(opts.input.id) ??
          opts.errors.NOT_FOUND({ data: { id: opts.input.id } }),
      ),
      create: impl.post.create.mutation((opts) =>
        opts.ctx.user
          ? this.#posts.add(opts.input.title)
          : opts.errors.UNAUTHORIZED(),
      ),
    };
  }

  @Implement(appContract.admin.stats)
  @UseGuards(AdminGuard)
  stats() {
    const posts = this.#posts;
    return impl.admin.stats.query(() =>
      Effect.gen(function* () {
        const counter = yield* RequestCounter;
        return { posts: posts.all().length, requests: yield* counter.next };
      }),
    );
  }
}
