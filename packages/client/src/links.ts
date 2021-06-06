type Context = {
  type: 'query' | 'mutation' | 'subscription';
  input: unknown;
};
type ResultEnvelope =
  | {
      ok: true;
      data: unknown;
    }
  | {
      ok: false;
      error: Error;
    };

type ContextLink = (opts: {
  ctx: Context;
  prev: (result: ResultEnvelope) => void;
  next: (ctx: Context, callback: (result: ResultEnvelope) => void) => void;
  onDone: (callback: () => void) => void;
}) => void;

type AppLink = () => ContextLink;

export function retryLink(opts: { attempts: number }): AppLink {
  // initialized config
  return () => {
    // initialized in app
    return ({ ctx, next, prev }) => {
      // initialized for request
      let attempts = 0;
      const fn = () => {
        attempts++;
        next(ctx, (result) => {
          if (result.ok) {
            prev(result);
          } else {
            attempts < opts.attempts ? fn() : prev(result);
          }
        });
      };
      fn();
    };
  };
}
