import express from 'express';
import { assertNotBrowser } from './assertNotBrowser';
import {
  getErrorResponseEnvelope,
  HTTPError,
  httpError,
  HTTPSuccessResponseEnvelope,
} from './http';
import { Router } from './router';
import { Subscription, SubscriptionDestroyError } from './subscription';

assertNotBrowser();

export type CreateExpressContextOptions = {
  req: express.Request;
  res: express.Response;
};
export type CreateExpressContextFn<TContext> = (
  opts: CreateExpressContextOptions,
) => Promise<TContext> | TContext;

function getQueryArgs(req: express.Request) {
  let args: unknown[] = [];

  const queryArgs = req.query.args;
  if (!queryArgs) {
    return args;
  }
  if (typeof queryArgs !== 'string') {
    throw httpError.badRequest('Expected query.args to be a JSON string');
  }
  try {
    args = JSON.parse(queryArgs);
  } catch (err) {
    throw httpError.badRequest('Expected query.args to be a JSON string');
  }

  if (!Array.isArray(args)) {
    throw httpError.badRequest(
      'Expected query.args to be parsed as an JSON-array',
    );
  }
  return args;
}
export function createExpressMiddleware<
  TContext,
  TRouter extends Router<TContext, any, any, any>
>({
  router,
  createContext,
  subscriptions,
}: {
  router: TRouter;
  createContext: CreateExpressContextFn<TContext>;
  subscriptions?: {
    timeout?: number;
  };
}): express.Handler {
  return async (req, res) => {
    try {
      const endpoint = req.path.substr(1);
      const ctx = await createContext({ req, res });

      let data: unknown;
      if (req.method === 'POST') {
        if (!router.has('mutations', endpoint)) {
          throw httpError.notFound(`Unknown mutation "${endpoint}"`);
        }

        const args = req.body.args ?? [];
        if (!Array.isArray(args)) {
          throw httpError.badRequest('Expected body.args to be an array');
        }

        data = await router.invokeMutation(ctx)(
          endpoint as any,
          ...(args as any),
        );
      } else if (req.method === 'GET') {
        if (!router.has('queries', endpoint)) {
          throw httpError.notFound(`Unknown query "${endpoint}"`);
        }
        const args = getQueryArgs(req);

        data = await router.invokeQuery(ctx)(endpoint as any, ...(args as any));
      } else if (req.method === 'PATCH') {
        if (!router.has('subscriptions', endpoint)) {
          throw httpError.notFound(`Unknown subscription "${endpoint}"`);
        }
        const args = req.body.args ?? [];
        if (!Array.isArray(args)) {
          throw httpError.badRequest('Expected body.args to be an array');
        }

        const sub: Subscription = await router.invokeSubscription(ctx)(
          endpoint as any,
          ...(args as any),
        );
        const onClose = () => {
          sub.destroy('closed');
        };

        // FIXME - refactor
        //  this is a bit complex
        // needs to handle a few cases:
        // - ok subscription
        // - error subscription
        // - request got prematurely closed
        // - request timed out
        res.once('close', onClose);
        const timeout = subscriptions?.timeout ?? 5000;
        const timer = setTimeout(() => {
          sub.destroy('timeout');
        }, timeout);
        try {
          data = await sub.onceDataAndStop();
          res.off('close', onClose);
        } catch (err) {
          res.off('close', onClose);
          clearTimeout(timer);
          if (
            err instanceof SubscriptionDestroyError &&
            err.reason === 'timeout'
          ) {
            throw new HTTPError(
              408,
              `Subscription exceeded ${timeout}ms - please reconnect.`,
            );
          }
          throw err;
        }
      } else {
        throw httpError.badRequest(`Unexpected request method ${req.method}`);
      }

      const json: HTTPSuccessResponseEnvelope<unknown> = {
        ok: true,
        statusCode: res.statusCode ?? 200,
        data,
      };
      res.status(json.statusCode).json(json);
    } catch (err) {
      const json = getErrorResponseEnvelope(err);

      res.status(json.statusCode).json(json);
    }
  };
}
