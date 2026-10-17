/**
 * Serve contract-first procedures from NestJS controllers (`@trpc12/nest`).
 * `@experimental_Implement(contract)` routes a controller method by the contract's REST
 * mapping, and the procedure it returns runs on `@trpc12/trpc/openapi`'s handler,
 * so the controller's injected services reach the resolver through `this`.
 *
 * @example
 * ```ts
 * @Controller()
 * class PostController {
 *   constructor(@Inject(Posts) private readonly posts: Posts) {}
 *
 *   @experimental_Implement(appContract.post.byId)
 *   byId() {
 *     return impl.post.byId.query(({ input }) => this.posts.find(input.id));
 *   }
 * }
 *
 * @Module({ imports: [experimental_TrpcModule.forRoot({ createContext })], controllers: [PostController] })
 * class AppModule {}
 * ```
 * @module
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { finished } from 'node:stream';
import { NodeHttpServer, NodeHttpServerRequest } from '@effect/platform-node';
import {
  applyDecorators,
  Delete,
  Get,
  Inject,
  Injectable,
  Module,
  Patch,
  Post,
  Put,
  UseInterceptors,
  type CallHandler,
  type DynamicModule,
  type ExecutionContext,
  type InjectionToken,
  type ModuleMetadata,
  type NestInterceptor,
  type OnApplicationShutdown,
  type OptionalFactoryDependency,
} from '@nestjs/common';
import { Effect, Exit, Scope, type Layer } from 'effect';
import { HttpServerRequest } from 'effect/http';
import { mergeMap, type Observable } from 'rxjs';
import { toContract } from '@trpc12/trpc/contract';
import { toHttpEffect } from '@trpc12/trpc/http';
import {
  createOpenApiHandler,
  resolveRoute,
  toBracketNotation,
  type BaseOpenApiHandlerOptions,
  type HttpMethod,
  type OpenApiCall,
  type OpenApiHandler,
} from '@trpc12/trpc/openapi';
import type { AnyProcedure, CreateContextOpts } from '@trpc12/trpc/server';

/**
 * The options of {@link experimental_TrpcModule.forRoot}: the OpenAPI handler's, with
 * Nest's `ExecutionContext` as `createContext`'s `platform`.
 * @example
 * ```ts
 * experimental_TrpcModule.forRoot({
 *   createContext: ({ platform }) => ({ user: platform.switchToHttp().getRequest().user }),
 *   layer: Db.layer,
 * });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export interface TrpcModuleOptions extends Omit<
  BaseOpenApiHandlerOptions<never>,
  'router' | 'prefix' | 'contract'
> {
  /** Runs once per request; `platform` is the Nest `ExecutionContext`. */
  createContext?: (
    opts: CreateContextOpts<ExecutionContext>,
  ) => object | Promise<object>;
  /**
   * Provides the Effect services the procedures need. Nest can't see which
   * those are, so a missing one fails the call.
   */
  layer?: Layer.Layer<any, any, never>;
}

/**
 * The options of {@link experimental_TrpcModule.forRootAsync}: a Nest factory provider.
 * @example
 * ```ts
 * experimental_TrpcModule.forRootAsync({
 *   inject: [Auth],
 *   useFactory: (auth: Auth) => ({ createContext: ({ platform }) => auth.contextOf(platform) }),
 * });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export interface TrpcModuleAsyncOptions extends Pick<
  ModuleMetadata,
  'imports'
> {
  useFactory: (
    ...args: any[]
  ) => TrpcModuleOptions | Promise<TrpcModuleOptions>;
  inject?: Array<InjectionToken | OptionalFactoryDependency>;
}

/**
 * The injection token of the {@link TrpcModuleOptions}.
 * @example
 * ```ts
 * constructor(@Inject(experimental_TRPC_MODULE_OPTIONS) options: TrpcModuleOptions) {}
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export const experimental_TRPC_MODULE_OPTIONS: unique symbol = Symbol(
  '@trpc12/nest/options',
);

interface Target {
  readonly path: string;
  readonly route: OpenApiCall['route'];
}

/** What each `@experimental_Implement` route serves, by the controller method Nest calls. */
const targets = new WeakMap<object, Target>();

const methodDecorators: Record<HttpMethod, (path: string) => MethodDecorator> =
  { GET: Get, POST: Post, PUT: Put, PATCH: Patch, DELETE: Delete };

const isProcedure = (value: unknown): value is AnyProcedure =>
  typeof value === 'object' && value !== null && '~trpc' in value;

/**
 * Serves `@experimental_Implement` routes: one OpenAPI handler for the app, so the
 * `layer` is built once, bridged to Nest's Node request and response by
 * Effect's `NodeHttpServer`.
 * @example
 * ```ts
 * app.get(experimental_TrpcHost).handler; // the OpenApiHandler behind every route
 * ```
 * @since 0.1.0
 * @stability experimental
 */
@Injectable()
export class experimental_TrpcHost implements OnApplicationShutdown {
  /** The OpenAPI handler every `@experimental_Implement` route runs on. */
  readonly handler: OpenApiHandler<ExecutionContext>;
  readonly #scope = Scope.makeUnsafe();
  readonly #pending = new WeakMap<
    IncomingMessage,
    { call: OpenApiCall; context: ExecutionContext }
  >();
  readonly #node: (req: IncomingMessage, res: ServerResponse) => void;

  constructor(
    @Inject(experimental_TRPC_MODULE_OPTIONS) options: TrpcModuleOptions,
  ) {
    const handler = createOpenApiHandler({
      ...options,
      router: {},
      prefix: '',
    } as never) as OpenApiHandler<ExecutionContext>;
    this.handler = handler;
    const app = Effect.flatMap(
      HttpServerRequest.HttpServerRequest,
      (request) => {
        const entry = this.#pending.get(
          NodeHttpServerRequest.toIncomingMessage(request),
        )!;
        return toHttpEffect({
          fetch: (web) => handler.serve(web, entry.call, entry.context),
        });
      },
    );
    this.#node = Effect.runSync(
      NodeHttpServer.makeHandler(app, { scope: this.#scope }),
    );
  }

  /** Serves the request behind `context` with `call`, once it's been sent. */
  serve(context: ExecutionContext, call: OpenApiCall): Promise<void> {
    const http = context.switchToHttp();
    const req = http.getRequest<IncomingMessage & { body?: unknown }>();
    const res = http.getResponse<ServerResponse>();
    // A body Nest's urlencoded parser read goes back as the form it was.
    if (
      /^application\/x-www-form-urlencoded\b/i.test(
        req.headers['content-type'] ?? '',
      ) &&
      typeof req.body === 'object' &&
      req.body !== null
    ) {
      req.body = new URLSearchParams(
        toBracketNotation(req.body) as Array<[string, string]>,
      ).toString();
    }
    this.#pending.set(req, { call, context });
    return new Promise((resolve) => {
      finished(res, () => resolve());
      this.#node(req, res);
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await Effect.runPromise(Scope.close(this.#scope, Exit.void));
    await this.handler.dispose();
  }
}

/**
 * Runs the procedure an `@experimental_Implement` method returns. `@experimental_Implement` adds it;
 * it only needs registering by hand on a module that doesn't import
 * {@link experimental_TrpcModule}'s global providers.
 * @example
 * ```ts
 * @UseInterceptors(experimental_ImplementInterceptor)
 * ```
 * @since 0.1.0
 * @stability experimental
 */
@Injectable()
export class experimental_ImplementInterceptor implements NestInterceptor {
  readonly #host: experimental_TrpcHost;

  constructor(@Inject(experimental_TrpcHost) host: experimental_TrpcHost) {
    this.#host = host;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const target = targets.get(context.getHandler());
    if (!target) return next.handle();
    return next.handle().pipe(
      mergeMap(async (procedure: unknown) => {
        if (!isProcedure(procedure)) {
          throw new TypeError(
            `@experimental_Implement: the method for "${target.path}" must return the procedure that implements it`,
          );
        }
        const req = context
          .switchToHttp()
          .getRequest<{ params: Record<string, string | string[]> }>();
        const params: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.params)) {
          params[key] = Array.isArray(value) ? value.join('/') : value;
        }
        await this.#host.serve(context, {
          path: target.path,
          procedure,
          route: target.route,
          params,
        });
      }),
    );
  }
}

const nestPath = (path: string) => path.replace(/\{([^{}]+)\}/g, ':$1');

const pick = (router: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[key]
          : undefined,
      router,
    );

const route = (
  target: object,
  key: string | symbol,
  descriptor: PropertyDescriptor,
  path: string,
  procedure: {
    type: Parameters<typeof resolveRoute>[1];
    route?: OpenApiCall['route'];
  },
) => {
  const resolved = resolveRoute(path, procedure.type, procedure.route, '');
  targets.set(descriptor.value as object, { path, route: procedure.route });
  applyDecorators(
    methodDecorators[resolved.method](nestPath(resolved.path)),
    UseInterceptors(experimental_ImplementInterceptor),
  )(target, key, descriptor);
};

/**
 * Routes a controller method by a contract's REST mapping and serves the
 * procedure it returns. Pass a leaf with a `route` meta `path`, and return
 * `impl.post.byId.query(…)`; or a contract router, and return
 * `impl.router({ … })`, with default paths from the keys below it
 * (`/post/byId`). Put it above the method's other decorators, which then
 * apply to every route it adds.
 *
 * @example
 * ```ts
 * @experimental_Implement(appContract)
 * all() {
 *   return impl.router({ post: { byId: impl.post.byId.query(({ input }) => this.posts.find(input.id)) } });
 * }
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function experimental_Implement(
  contract: object,
): (
  target: object,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
) => void {
  return (target, propertyKey, descriptor) => {
    const name = String(propertyKey);
    if (isProcedure(contract)) {
      const def = toContract({ [name]: contract }).procedures[name]!;
      if (!def.route?.path) {
        throw new Error(
          `@experimental_Implement on ${name}(): a contract leaf needs a route path, .meta({ route: { path } }); or implement the router above it for default paths`,
        );
      }
      route(target, propertyKey, descriptor, name, def);
      return;
    }
    const original = descriptor.value as (...args: unknown[]) => unknown;
    for (const [path, def] of Object.entries(toContract(contract).procedures)) {
      const key = `${name}.${path}`;
      const method = {
        async [key](this: unknown, ...args: unknown[]) {
          return pick(await original.apply(this, args), path);
        },
      }[key]!;
      const own: PropertyDescriptor = {
        value: method,
        writable: true,
        configurable: true,
      };
      Object.defineProperty(target, key, own);
      // Nest keeps a method's guards and pipes on the function, and its
      // parameter decorators on the class under the method's name.
      for (const m of Reflect.getOwnMetadataKeys(original)) {
        Reflect.defineMetadata(m, Reflect.getOwnMetadata(m, original), method);
      }
      const ctor = target.constructor;
      for (const m of Reflect.getOwnMetadataKeys(ctor, propertyKey)) {
        const value: unknown = Reflect.getOwnMetadata(m, ctor, propertyKey);
        Reflect.defineMetadata(m, value, ctor, key);
      }
      route(target, key, own, path, def);
    }
  };
}

/**
 * Provides the handler `@experimental_Implement` routes run on, to every module.
 * @example
 * ```ts
 * @Module({ imports: [experimental_TrpcModule.forRoot({ createContext, layer })], controllers: [PostController] })
 * class AppModule {}
 * ```
 * @since 0.1.0
 * @stability experimental
 */
@Module({})
export class experimental_TrpcModule {
  /** Configures the handler with fixed options. */
  static forRoot(options: TrpcModuleOptions = {}): DynamicModule {
    return {
      module: experimental_TrpcModule,
      global: true,
      providers: [
        { provide: experimental_TRPC_MODULE_OPTIONS, useValue: options },
        experimental_TrpcHost,
        experimental_ImplementInterceptor,
      ],
      exports: [
        experimental_TRPC_MODULE_OPTIONS,
        experimental_TrpcHost,
        experimental_ImplementInterceptor,
      ],
    };
  }

  /** Configures the handler from a factory that can inject providers. */
  static forRootAsync(options: TrpcModuleAsyncOptions): DynamicModule {
    return {
      module: experimental_TrpcModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        {
          provide: experimental_TRPC_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        experimental_TrpcHost,
        experimental_ImplementInterceptor,
      ],
      exports: [
        experimental_TRPC_MODULE_OPTIONS,
        experimental_TrpcHost,
        experimental_ImplementInterceptor,
      ],
    };
  }
}
