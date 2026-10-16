/* eslint-disable ts/no-empty-object-type */

import type { MergedErrorMap } from './error-utils'
import { expectTypeOf, it } from 'vitest'

it('MergedErrorMap', () => {
  expectTypeOf<MergedErrorMap<{ BAD_REQUEST: {} }, { NOT_FOUND: {}, INTERNAL_SERVER_ERROR: {} }>>().toEqualTypeOf<{ BAD_REQUEST: {} } & { NOT_FOUND: {}, INTERNAL_SERVER_ERROR: {} }>()
  expectTypeOf<MergedErrorMap<{ BAD_REQUEST: {} }, { BAD_REQUEST: {} }>>().toEqualTypeOf<{ BAD_REQUEST: {} }>()
  expectTypeOf<MergedErrorMap<{ BAD_REQUEST: {} }, {}>>().toEqualTypeOf<{ BAD_REQUEST: {} }>()
  expectTypeOf<MergedErrorMap<{}, { BAD_REQUEST: {} }>>().toEqualTypeOf<{ BAD_REQUEST: {} }>()
  expectTypeOf<MergedErrorMap<{}, {}>>().toEqualTypeOf<{}>()
})
