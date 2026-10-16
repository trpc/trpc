import { createRequestLogger } from 'evlog'
import { getLogger, LOGGER_CONTEXT_SYMBOL } from './context'

it('getLogger', async () => {
  expect(getLogger({})).toBeUndefined()
  expect(getLogger({ something: true } as any)).toBeUndefined()

  const logger = createRequestLogger()
  expect(getLogger({ [LOGGER_CONTEXT_SYMBOL]: logger })).toBe(logger)
})
