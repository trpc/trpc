// --------------- "Library code" ---------------

type Prefix<K extends string, T extends string> = `${K}${T}`;

type Prefixer<TObj extends Record<string, any>, TPrefix extends string> = {
  [P in keyof TObj as Prefix<TPrefix, string & P>]: TObj[P];
};


type ResolverFn<TContext, TData, TArgs extends any[]> = (
  ctx: TContext,
  ...args: TArgs
) => Promise<TData> | TData;

type DropFirst<T extends readonly unknown[]> = T extends readonly [any?, ...infer U] ? U : [...T];


class Router<
  TContext extends {},
  TEndpoints extends Record<string, ResolverFn<TContext, any, any>> = {}
> {
  readonly endpoints: TEndpoints;

  constructor(endpoints: TEndpoints) {
    this.endpoints = endpoints;
  }

  public endpoint<TData, TArgs extends any[], TPath extends string>(
    path: TPath,
    resolver: ResolverFn<TContext, TData, TArgs>,
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

  public handler(ctx: TContext) {
    return <
      TPath extends keyof TEndpoints,
      TArgs extends DropFirst<Parameters<TResolver>>,
      TResolver extends TEndpoints[TPath]
    >(path: TPath, ...args: TArgs): ReturnType<TResolver> => {
      return this.endpoints[path](ctx, ...args);
    }
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
  .endpoint('create', (_, input: { name: string }) => {
    return {
      ...input,
    }
  })
  .endpoint('list', () => {
    return [{
      id: '1',
      name: 'test',
    }]
  });

// create router for posts
const posts = createRouter().endpoint('create', (_, input: {
  title: string
}) => {
  return {
    ...input,
  }
})

// root router to call
const rootRouter = createRouter()
  .endpoint('hello', (ctx, input?: string) => {
    return `hello ${input ?? ctx.user.name ?? 'world'}`
  })
  .compose('posts', posts)
  .compose('users', users)


async function main() {
  const ctx: Context = {
    user: {
      name: 'Alex',
    }
  }
  const handle = rootRouter.handler(ctx)

  {
    const res = await handle('hello', 'test')
    console.log(res)
  }
  {
    const res = await handle('hello')
    console.log(res)
  }
  {
    const res = await handle('users/list')
    console.log(res)
  }
  {
    const res = await handle('posts/create', {
      title: 'test'
    })
    console.log(res)
  }
  
}

main()