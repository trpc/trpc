import { Context } from 'effect';

/**
 * Each of our handlers' services (its HTTP app, socket core and upgrade
 * server), for the adapters that are handed the handler object:
 * `toHttpEffect()`, `experimental_serveSocket()` and the hibernating Durable Object.
 * They get the user's plain object, so the lookup is by its identity.
 */
const contexts = new WeakMap<object, Context.Context<never>>();

/** Gives `handler` its services. @internal */
export const setHandlerContext = <Services>(
  handler: object,
  context: Context.Context<Services>,
): void => {
  contexts.set(handler, context as Context.Context<never>);
};

/** The services of `handler`; none for a handler that isn't ours. @internal */
export const handlerContext = (handler: object): Context.Context<never> =>
  contexts.get(handler) ?? Context.empty();
