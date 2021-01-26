export type RouteDefInput<TInput = unknown> = {
  parse: (input: unknown) => TInput;
};
export type RouteDefResolver<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown
> = (opts: { ctx: TContext; input: TInput }) => Promise<TOutput> | TOutput;

export type RouteDef<
  TContext = unknown,
  TInput = unknown,
  TOutput = unknown
> = {
  input?: RouteDefInput<TInput>;
  resolve: RouteDefResolver<TContext, TInput, TOutput>;
};

export type inferRouteInput<
  TRoute extends RouteDef<any, any, any>
> = TRoute['input'] extends RouteDefInput<any>
  ? ReturnType<TRoute['input']['parse']>
  : undefined;

const context = {};
function createRoute<TInput, TOutput>(
  route: RouteDef<typeof context, TInput, TOutput>,
) {
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
  resolve({ input }) {
    return {
      output: input,
    };
  },
});

const myRoute2 = createRoute({
  resolve({ input }) {
    return {
      output: input,
    };
  },
});

// this should render MyRouteInput1 as "string"
type MyRouteInput1 = inferRouteInput<typeof myRoute1>;

// this should render MyRouteInput2 as "undefined" (works)
type MyRouteInput2 = inferRouteInput<typeof myRoute2>;
