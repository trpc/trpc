import { expectTypeOf, test } from 'vitest'
import type { ErrorComponentProps } from '../src'

test('ErrorComponentProps defaults error to unknown', () => {
  expectTypeOf<ErrorComponentProps['error']>().toEqualTypeOf<unknown>()
  expectTypeOf<ErrorComponentProps<Error>['error']>().toEqualTypeOf<Error>()
})
