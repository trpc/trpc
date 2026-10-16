import type { RequestLogger } from 'evlog'

export const LOGGER_CONTEXT_SYMBOL: unique symbol = Symbol.for('ORPC_EVLOG_LOGGER_CONTEXT')

/**
 * Context shape that carries the Evlog request logger injected by `EvlogHandlerPlugin`.
 *
 * @see {@link https://orpc.dev/docs/integrations/evlog#without-asynclocalstorage | Evlog Integration - Without AsyncLocalStorage}
 */
export interface LoggerContext {
  [LOGGER_CONTEXT_SYMBOL]?: undefined | RequestLogger
}

/**
 * Retrieves the Evlog request logger from the oRPC context, if available.
 *
 * @see {@link https://orpc.dev/docs/integrations/evlog#without-asynclocalstorage | Evlog Integration - Without AsyncLocalStorage}
 */
export function getLogger(context: LoggerContext): RequestLogger | undefined {
  return context[LOGGER_CONTEXT_SYMBOL]
}
