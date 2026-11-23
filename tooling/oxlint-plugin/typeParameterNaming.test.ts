import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';
import plugin from './index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } },
});

tester.run('type-parameter-naming', plugin.rules['type-parameter-naming']!, {
  valid: [
    'type Box<T> = { value: T };',
    'function identity<TValue>(value: TValue) { return value; }',
    'type Pair<T1, T2> = [T1, T2];',
    'type Root<$Router> = $Router;',
    'type Shape<TInput2> = TInput2;',
    'type Ignored<_TContext> = never;',
    'class Store<TState> { state!: TState; }',
    'type Unwrap<T> = T extends Promise<infer $T> ? $T : T;',
  ],
  invalid: [
    {
      code: 'type Box<Value> = { value: Value };',
      errors: [{ messageId: 'pattern' }],
    },
    {
      code: 'function identity<tValue>(value: tValue) { return value; }',
      errors: [{ messageId: 'pattern' }],
    },
    {
      code: 'type Box<T_Value> = T_Value;',
      errors: [{ messageId: 'pattern' }],
    },
    {
      code: 'type Box<__T> = __T;',
      errors: [{ messageId: 'pattern' }],
    },
    {
      code: 'type Box<TA> = TA;',
      errors: [{ messageId: 'pattern' }],
    },
  ],
});
