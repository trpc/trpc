export type RouteInput<TInput = unknown> = {
  parse: (input: unknown) => TInput;
};
export type RouteResolver<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown
> = (ctx: TContext, input: TInput) => Promise<TOutput> | TOutput;

// export type Route<
//   TContext = unknown,
//   TInput = unknown,
//   TOutput = unknown
// > = {
//   input?: RouteInput<TInput>;
//   resolve: RouteResolver<TContext, TInput, TOutput>;
// };

export type RouteWithInput<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown
> = {
  input: RouteInput<TInput>;
  resolve: RouteResolver<TContext, TInput, TOutput>;
};

export type RouteWithoutInput<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown
> = {
  resolve: RouteResolver<TContext, TInput, TOutput>;
};
export type Route<TContext = unknown, TInput = unknown, TOutput = unknown> =
  | RouteWithInput<TContext, TInput, TOutput>
  | RouteWithoutInput<TContext, TInput, TOutput>;

export type inferRouteInput<
  TRoute extends Route<any, any, any>
> = TRoute extends Route<any, infer Input, any> ? Input : never;

const context = {};

function createRoute<TInput, TOutput>(
  route: RouteWithInput<typeof context, TInput, TOutput>,
): RouteWithInput<typeof context, TInput, TOutput>;
function createRoute<TInput, TOutput>(
  route: RouteWithoutInput<typeof context, TInput, TOutput>,
): RouteWithoutInput<typeof context, TInput, TOutput>;
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
