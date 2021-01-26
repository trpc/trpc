export type RouteDefInput<TInput = unknown> = {
  parse: (input: unknown) => TInput;
};
export type RouteDefResolver<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown
> = (ctx: TContext, input: TInput) => Promise<TOutput> | TOutput;

// export type RouteDef<
//   TContext = unknown,
//   TInput = unknown,
//   TOutput = unknown
// > = {
//   input?: RouteDefInput<TInput>;
//   resolve: RouteDefResolver<TContext, TInput, TOutput>;
// };

export type RouteDefWithInput<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown
> = {
  input: RouteDefInput<TInput>;
  resolve: RouteDefResolver<TContext, TInput, TOutput>;
};

export type RouteDefWithoutInput<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown
> = {
  resolve: RouteDefResolver<TContext, TInput, TOutput>;
};
export type RouteDef<TContext = unknown, TInput = unknown, TOutput = unknown> =
  | RouteDefWithInput<TContext, TInput, TOutput>
  | RouteDefWithoutInput<TContext, TInput, TOutput>;

export type inferRouteInput<
  TRoute extends RouteDef<any, any, any>
> = TRoute extends RouteDef<any, infer Input, any> ? Input : never;

const context = {};

function createRoute<TInput, TOutput>(
  route: RouteDefWithInput<typeof context, TInput, TOutput>,
): RouteDefWithInput<typeof context, TInput, TOutput>;
function createRoute<TInput, TOutput>(
  route: RouteDefWithoutInput<typeof context, TInput, TOutput>,
): RouteDefWithoutInput<typeof context, TInput, TOutput>;
function createRoute(route: any) {
  return route;
}

function stringParser(input: unknown): string {
  if (typeof input === 'string') {
    return input;
  }
  throw new Error('not a string');
}

const myRoute1 = createRoute({
  input: {
    parse: stringParser,
  },
  resolve(ctx, input) {
    return {
      output: input,
    };
  },
});

const myRoute2 = createRoute({
  resolve(ctx, input: number) {
    return {
      output: input,
    };
  },
});

// this should render MyRouteInput1 as "string"
type MyRouteInput1 = inferRouteInput<typeof myRoute1>;

// this should render MyRouteInput2 as "unknown" (works)
type MyRouteInput2 = inferRouteInput<typeof myRoute2>;
