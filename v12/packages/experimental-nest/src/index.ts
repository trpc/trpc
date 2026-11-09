/**
 * Serve contract-first procedures from NestJS controllers (`@trpc12/experimental-nest`).
 * `@Implement(contract)` routes a controller method by the contract's REST
 * mapping, and the procedure it returns runs on `@trpc12/trpc/openapi`'s handler,
 * so the controller's injected services reach the resolver through `this`.
 *
 * @example
 * ```ts
 * @Controller()
 * class PostController {
 *   constructor(@Inject(Posts) private readonly posts: Posts) {}
 *
 *   @Implement(appContract.post.byId)
 *   byId() {
 *     return impl.post.byId.query(({ input }) => this.posts.find(input.id));
 *   }
 * }
 *
 * @Module({ imports: [TrpcModule.forRoot({ createContext })], controllers: [PostController] })
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
import { Effect, Exit, Scope, type Layer, type ManagedRuntime } from 'effect';
import { HttpServerRequest } from 'effect/http';
import { mergeMap, type Observable } from 'rxjs';
import { experimental_toContract } from '@trpc12/trpc/contract';
import { toHttpEffect } from '@trpc12/trpc/http';
import {
  experimental_createOpenApiHandler,
  experimental_resolveRoute,
  experimental_toBracketNotation,
  type BaseOpenApiHandlerOptions,
  type HttpMethod,
  type OpenApiCall,
  type OpenApiHandler,
} from '@trpc12/trpc/openapi';
import type { AnyProcedure, CreateContextOpts } from '@trpc12/trpc/server';

/**
 * The options of {@link TrpcModule.forRoot}: the OpenAPI handler's, with
 * Nest's `ExecutionContext` as `createContext`'s `platform`.
 * @example
 * ```ts
 * TrpcModule.forRoot({
 *   createContext: ({ platform }) => ({ user: platform.switchToHttp().getRequest().user }),
 *   layer: Db.layer,
 * });
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export type TrpcModuleOptions = Omit<
  BaseOpenApiHandlerOptions<never>,
  'router' | 'prefix' | 'contract'
> & {
  /** Runs once per request; `platform` is the Nest `ExecutionContext`. */
  createContext?: (
    opts: CreateContextOpts<ExecutionContext>,
  ) => object | Promise<object>;
} & (
    | {
        /**
         * Provides the Effect services the procedures need, built once and
         * released when the app closes. Nest can't see which those are, so
         * a missing one fails the call.
         */
        layer?: Layer.Layer<any, any, never>;
        /** Not with `layer`: pass one or the other. */
        runtime?: undefined;
      }
    | {
        /**
         * Provides the services instead of `layer`, from a runtime the
         * caller owns and shares with the rest of the app. Closing the app
         * leaves it running; `runtime.dispose()` releases it.
         */
        runtime: ManagedRuntime.ManagedRuntime<any, any>;
        /** Not with `runtime`: pass one or the other. */
        layer?: undefined;
      }
  );

/**
 * The options of {@link TrpcModule.forRootAsync}: a Nest factory provider.
 * @example
 * ```ts
 * TrpcModule.forRootAsync({
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
 * constructor(@Inject(TRPC_MODULE_OPTIONS) options: TrpcModuleOptions) {}
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export const TRPC_MODULE_OPTIONS: unique symbol = Symbol(
  '@trpc12/experimental-nest/options',
);

interface Target {
  readonly path: string;
  readonly route: OpenApiCall['route'];
}

/** What each `@Implement` route serves, by the controller method Nest calls. */
const targets = new WeakMap<object, Target>();

const methodDecorators: Record<HttpMethod, (path: string) => MethodDecorator> =
  { GET: Get, POST: Post, PUT: Put, PATCH: Patch, DELETE: Delete };

const isProcedure = (value: unknown): value is AnyProcedure =>
  typeof value === 'object' && value !== null && '~trpc' in value;

/**
 * Serves `@Implement` routes: one OpenAPI handler for the app, so the
 * `layer` is built once, bridged to Nest's Node request and response by
 * Effect's `NodeHttpServer`.
 * @example
 * ```ts
 * app.get(TrpcHost).handler; // the OpenApiHandler behind every route
 * ```
 * @since 0.1.0
 * @stability experimental
 */
@Injectable()
export class TrpcHost implements OnApplicationShutdown {
  /** The OpenAPI handler every `@Implement` route runs on. */
  readonly handler: OpenApiHandler<ExecutionContext>;
  readonly #scope = Scope.makeUnsafe();
  readonly #pending = new WeakMap<
    ReturnType<typeof NodeHttpServerRequest.toIncomingMessage>,
    { call: OpenApiCall; context: ExecutionContext }
  >();
  readonly #node: (req: IncomingMessage, res: ServerResponse) => void;

  constructor(@Inject(TRPC_MODULE_OPTIONS) options: TrpcModuleOptions) {
    if (options.runtime && options.layer) {
      throw new TypeError('TrpcModule: pass `layer` or `runtime`, not both');
    }
    const handler = experimental_createOpenApiHandler({
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
    // The handler is disposed last, after the request fibers end.
    this.#node = Effect.runSync(
      Scope.addFinalizer(
        this.#scope,
        Effect.promise(() => handler.dispose()),
      ).pipe(
        Effect.andThen(NodeHttpServer.makeHandler(app, { scope: this.#scope })),
      ),
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
        experimental_toBracketNotation(req.body) as Array<[string, string]>,
      ).toString();
    }
    this.#pending.set(req, { call, context });
    return Effect.runPromise(
      Effect.callback<void>((resume) => {
        const cleanup = finished(res, () => resume(Effect.void));
        this.#node(req, res);
        return Effect.sync(cleanup);
      }),
    );
  }

  /** Ends the requests in flight, then disposes the handler and its layer. */
  onApplicationShutdown(): Promise<void> {
    return Effect.runPromise(Scope.close(this.#scope, Exit.void));
  }
}

/**
 * Runs the procedure an `@Implement` method returns. `@Implement` adds it;
 * it only needs registering by hand on a module that doesn't import
 * {@link TrpcModule}'s global providers.
 * @example
 * ```ts
 * @UseInterceptors(ImplementInterceptor)
 * ```
 * @since 0.1.0
 * @stability experimental
 */
@Injectable()
export class ImplementInterceptor implements NestInterceptor {
  readonly #host: TrpcHost;

  constructor(@Inject(TrpcHost) host: TrpcHost) {
    this.#host = host;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const target = targets.get(context.getHandler());
    if (!target) return next.handle();
    return next.handle().pipe(
      mergeMap(async (procedure: unknown) => {
        if (!isProcedure(procedure)) {
          throw new TypeError(
            `@Implement: the method for "${target.path}" must return the procedure that implements it`,
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
    type: Parameters<typeof experimental_resolveRoute>[1];
    route?: OpenApiCall['route'];
  },
) => {
  const resolved = experimental_resolveRoute(
    path,
    procedure.type,
    procedure.route,
    '',
  );
  targets.set(descriptor.value as object, { path, route: procedure.route });
  applyDecorators(
    methodDecorators[resolved.method](nestPath(resolved.path)),
    UseInterceptors(ImplementInterceptor),
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
 * @Implement(appContract)
 * all() {
 *   return impl.router({ post: { byId: impl.post.byId.query(({ input }) => this.posts.find(input.id)) } });
 * }
 * ```
 * @since 0.1.0
 * @stability experimental
 */
export function Implement(
  contract: object,
): (
  target: object,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
) => void {
  return (target, propertyKey, descriptor) => {
    const name = String(propertyKey);
    if (isProcedure(contract)) {
      const def = experimental_toContract({ [name]: contract }).procedures[
        name
      ]!;
      if (!def.route?.path) {
        throw new Error(
          `@Implement on ${name}(): a contract leaf needs a route path, .meta({ route: { path } }); or implement the router above it for default paths`,
        );
      }
      route(target, propertyKey, descriptor, name, def);
      return;
    }
    const original = descriptor.value as (...args: unknown[]) => unknown;
    for (const [path, def] of Object.entries(
      experimental_toContract(contract).procedures,
    )) {
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
 * Provides the handler `@Implement` routes run on, to every module.
 * @example
 * ```ts
 * @Module({ imports: [TrpcModule.forRoot({ createContext, layer })], controllers: [PostController] })
 * class AppModule {}
 * ```
 * @since 0.1.0
 * @stability experimental
 */
@Module({})
export class TrpcModule {
  /** Configures the handler with fixed options. */
  static forRoot(options: TrpcModuleOptions = {}): DynamicModule {
    return {
      module: TrpcModule,
      global: true,
      providers: [
        { provide: TRPC_MODULE_OPTIONS, useValue: options },
        TrpcHost,
        ImplementInterceptor,
      ],
      exports: [TRPC_MODULE_OPTIONS, TrpcHost, ImplementInterceptor],
    };
  }

  /** Configures the handler from a factory that can inject providers. */
  static forRootAsync(options: TrpcModuleAsyncOptions): DynamicModule {
    return {
      module: TrpcModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        {
          provide: TRPC_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        TrpcHost,
        ImplementInterceptor,
      ],
      exports: [TRPC_MODULE_OPTIONS, TrpcHost, ImplementInterceptor],
    };
  }
}
