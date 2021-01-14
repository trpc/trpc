// --------------- "Library code" ---------------

type Prefix<K extends string, T extends string> = `${K}${T}`;

type Prefixer<TObj extends Record<string, any>, TPrefix extends string> = {
  [P in keyof TObj as Prefix<TPrefix, string & P>]: TObj[P];
};


type ResolverFn<TContext, TData, TInput> = (
  input: TInput,
  ctx: TContext,
) => Promise<TData> | TData;

class Router<
  TContext extends {},
  TEndpoints extends Record<string, ResolverFn<TContext, any, any>> = {}
> {
  readonly endpoints: TEndpoints;

  constructor(endpoints: TEndpoints) {
    this.endpoints = endpoints;
  }

  public endpoint<TData, TInput, TPath extends string>(
    path: TPath,
    resolver: ResolverFn<TContext, TData, TInput>,
  ) {
    const route = {
      [path]: resolver,
    } as Record<TPath, typeof resolver>;

    return new Router<TContext, TEndpoints & typeof route>({
      ...this.endpoints,
      ...route,
    });
  }

  public compose<
    TPath extends string,
    TChildRouter extends Router<TContext, any>
  >(
    path: TPath,
    router: TChildRouter,
  ): Router<TContext, TEndpoints & Prefixer<TChildRouter['endpoints'], `${TPath}/`>> {
    return router.routeNames().reduce((r, key) => {
      return r.endpoint(`${path}/${key}`, router.endpoints[key]);
    }, this as any);
  }

  public routeNames() {
    return Object.keys(this.endpoints) as Extract<keyof TEndpoints, string>[];
  }

  public async handle<
    TPath extends keyof TEndpoints,
    TInput extends Parameters<TResolver>[0],
    TResolver extends TEndpoints[TPath]
  >(path: TPath, input: TInput, ctx: TContext) {
    return this.endpoints[path](input, ctx);
  }
}


// --------------- Implementation -------------------

type Context = {
  user?: {
    name: String,
  }
};


function createRouter() {
  return new Router<Context>({});
}

// create router for users
const users = createRouter()
  .endpoint('create', (input: { name: string }) => {
    return {
      ...input,
    }
  })
  .endpoint('list', (_, ctx) => {
    return []
  });

// create router for posts
const posts = createRouter().endpoint('create', (input: {
  title: string
}) => {
  return {
    ...input,
  }
})

// root router to call
const rootRouter = createRouter()
  .endpoint('hello', (input: string, ctx) => {
    return `hello ${input || ctx.user.name || 'world'}`
  })
  .compose('posts', posts)
  .compose('users', users)


async function main() {
  const ctx: Context = {
    user: {
      name: 'Alex',
    }
  }
  // the handle method is completely type-safe
  // using string literals to create "paths"
  console.log(await rootRouter.handle('hello', 'Collin', ctx))
  console.log(await rootRouter.handle('posts/create', {title: 'my first post'}, ctx))
  
}

main()