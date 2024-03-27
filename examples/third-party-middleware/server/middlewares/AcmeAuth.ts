import type { AnyTRPCMiddlewareFunction } from '@trpc/server';
import { TRPCError } from '@trpc/server';

type Next = Parameters<AnyTRPCMiddlewareFunction>[0]['next'];

//
// An isolated auth middleware which takes some config to create a re-usable applier,
// and requires no knowledge of the user's tRPC types to be written and consumed
//

type Config = {
  authServer: string;
};

type State = {
  token?: string;
};

// an imaginary auth system
function checkAuthToken(config: Config, token?: string) {
  if (token === 'acme') {
    return {
      id: '1',
      name: 'Acme',
    };
  }

  return false;
}

// A simple approach to creating an external middlware applier
// The downside is the config needs passing on every usage, which might not be appropriate for ever library
export function applySimpleAcmeAuthMiddleware<TNext extends Next>(
  next: TNext,
  state: State,
  config: Config,
) {
  const user = checkAuthToken(config, state.token);

  if (!user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Invalid token',
    });
  }

  return next({
    ctx: {
      user: user,
    },
  });
}

// Wrapping in a factory function the config can be passed once, and the applier can be re-used
export function createAcmeAuthMiddleware(config: Config) {
  function applyAcmeAuthMiddleware<TNext extends Next>(
    next: TNext,
    state: State,
  ) {
    const user = checkAuthToken(config, state.token);

    if (!user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid token',
      });
    }

    return next({
      ctx: {
        user: user,
      },
    });
  }

  return {
    applyAcmeAuthMiddleware,
  };
}
