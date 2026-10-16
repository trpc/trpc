import { beforeEach } from 'vitest'
import { endMemoryTurn, isMemoryInstrumented } from '../turn'

// @ts-expect-error
global.IS_REACT_ACT_ENVIRONMENT = true

const scrollTo = () => {}

window.scrollTo = scrollTo
globalThis.scrollTo = scrollTo

export {}

if (isMemoryInstrumented()) {
  beforeEach(endMemoryTurn)
}
