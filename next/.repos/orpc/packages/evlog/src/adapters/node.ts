import type { StandardRequest } from '@standard-server/core'
import type { RequestLogger } from 'evlog'
import type { FrameworkIntegrationSpec } from 'evlog/toolkit'
import { createLoggerStorage as baseCreateLoggerStorage } from 'evlog/toolkit'

/**
 * Creates an AsyncLocalStorage-backed logger store. Pass `storage` to
 * `EvlogHandlerPlugin` and call `useLogger` inside procedures to access the request logger.
 *
 * @see {@link https://orpc.dev/docs/integrations/evlog#using-the-logger-in-your-code | Evlog Integration - Using the Logger in Your Code}
 */
export function createLoggerStorage(): {
  storage: FrameworkIntegrationSpec<{ request: StandardRequest }>['storage']
  useLogger: () => Required<RequestLogger>
} {
  return baseCreateLoggerStorage(
    'please configure EvlogHandlerPlugin for your handler using the created storage',
  ) as any
}
