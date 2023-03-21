import rule from '../../src/rules/noExplicitProcedureTyping'
import { ESLintUtils } from '@typescript-eslint/utils';

const ruleTester = new ESLintUtils.RuleTester({
  parser: '@typescript-eslint/parser',
});

const messageId = 'explicit-procedure-typing';

ruleTester.run('no-explicit-procedure-typing', rule, {
  valid: [
    `procedure.input(z.object({})).query(() => ({ foo: 'bar' }))`,
    `procedure.input(z.object({})).query(() => ({ foo: 'bar' }))`,
  ],
  invalid: [
    {
      code: `
        type Foo = { foo: 'bar' }
        procedure.input(z.object({})).mutation<Foo>(() => ({ foo: 'bar' }))
      `,
      errors: [{ line: 3, messageId }],
    },
    {
      code: `
        type Foo = { foo: 'bar' }
        procedure.input(z.object({})).query<Foo>(() => ({ foo: 'bar' }))
      `,
      errors: [{ line: 3, messageId }],
    },
  ],
})
