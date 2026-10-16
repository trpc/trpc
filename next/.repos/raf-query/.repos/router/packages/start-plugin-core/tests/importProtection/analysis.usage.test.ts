import { describe, expect, test } from 'vitest'
import {
  findOriginalUnsafeUsagePos,
  findOriginalUnsafeUsagePosFromResult,
  findPostCompileUsagePos,
} from '../../src/import-protection/analysis'

function pos(code: string, source: string) {
  return findPostCompileUsagePos(code, source)
}

function originalPos(
  code: string,
  source: string,
  envType: 'client' | 'server',
) {
  return findOriginalUnsafeUsagePos(code, source, envType)
}

describe('findPostCompileUsagePos', () => {
  test('returns undefined when there is no import from the source', () => {
    expect(pos(`const x = 1`, 'denied')).toBeUndefined()
  })

  test('reports UTF-16 columns after astral characters, tabs and CRLF line endings', () => {
    const code =
      "import { secret } from 'denied'\r\n" +
      '// 👨‍👩‍👧 𝒳𝒴 日本語\r\n' +
      "\tconst label = '🎉'; const value = secret()\r\n"
    expect(pos(code, 'denied')).toEqual({
      line: 3,
      column0: "\tconst label = '🎉'; const value = ".length,
    })
  })

  test('returns undefined when import is type-only', () => {
    expect(
      pos(`import type { Foo } from 'denied';\nconst x = 1`, 'denied'),
    ).toBeUndefined()
  })

  test('finds preferred call usage for named import', () => {
    const p = pos(
      `import { getRequest } from 'denied';\nexport function x(){ return getRequest() }`,
      'denied',
    )
    expect(p).toBeDefined()
    expect(p!.line).toBe(2)
  })

  test('prefers call usage over earlier non-preferred identifier usage', () => {
    const p = pos(
      `import { getRequest } from 'denied';\nconst a = getRequest;\ngetRequest()`,
      'denied',
    )
    expect(p).toBeDefined()
    expect(p!.line).toBe(3)
  })

  test('falls back to non-binding identifier usage if no preferred usage exists', () => {
    const p = pos(`import { x } from 'denied';\nconst y = x;`, 'denied')
    expect(p).toBeDefined()
    expect(p!.line).toBe(2)
  })

  test('ignores binding positions (variable declarator id)', () => {
    const p = pos(
      `import { x } from 'denied';\n{ const x = 1;\nconst y = x; }`,
      'denied',
    )
    expect(p).toBeUndefined()
  })

  test('ignores object property key (non-shorthand) but still finds later usage', () => {
    const p = pos(
      `import { x } from 'denied';\nconst obj = { x: 1 };\nx()`,
      'denied',
    )
    expect(p).toBeDefined()
    expect(p!.line).toBe(3)
  })

  test('ignores shadowed identifiers in nested function scope', () => {
    const p = pos(
      `import { x } from 'denied';\nfunction inner(x: any){ return x }\nconst y = x;`,
      'denied',
    )
    expect(p).toBeDefined()
    expect(p!.line).toBe(3)
  })

  test('ignores shadowing via catch clause param', () => {
    const p = pos(
      `import { err } from 'denied';\ntry { throw 1 } catch (err) { console.log(err) }\nconsole.log(err)`,
      'denied',
    )
    expect(p).toBeDefined()
    expect(p!.line).toBe(3)
  })

  test('handles namespace member preferred usage (ns.foo)', () => {
    const p = pos(`import * as ns from 'denied';\nns.getRequest()`, 'denied')
    expect(p).toBeDefined()
    expect(p!.line).toBe(2)
  })

  test('handles default import preferred usage (call)', () => {
    const p = pos(`import req from 'denied';\nreq()`, 'denied')
    expect(p).toBeDefined()
    expect(p!.line).toBe(2)
  })

  test('counts object pattern shorthand as usage (not a binding position)', () => {
    const p = pos(
      `import { foo } from 'denied';\nconst obj = { foo };`,
      'denied',
    )
    expect(p).toBeDefined()
    expect(p!.line).toBe(2)
  })

  test('var in block scope shadows import at function level', () => {
    const p = pos(
      [
        `import { x } from 'denied';`,
        `function f() {`,
        `  if (true) {`,
        `    var x = 1;`,
        `  }`,
        `  return x;`,
        `}`,
      ].join('\n'),
      'denied',
    )
    expect(p).toBeUndefined()
  })

  test('var in block scope does NOT shadow import in outer scope', () => {
    const p = pos(
      [
        `import { x } from 'denied';`,
        `function f() {`,
        `  if (true) {`,
        `    var x = 1;`,
        `  }`,
        `  return x;`,
        `}`,
        `console.log(x);`,
      ].join('\n'),
      'denied',
    )
    expect(p).toBeDefined()
    expect(p!.line).toBe(8)
  })

  test('let in block scope does NOT shadow import in enclosing function', () => {
    const p = pos(
      [
        `import { x } from 'denied';`,
        `function f() {`,
        `  if (true) {`,
        `    let x = 1;`,
        `  }`,
        `  return x;`,
        `}`,
      ].join('\n'),
      'denied',
    )
    expect(p).toBeDefined()
    expect(p!.line).toBe(6)
  })

  test('const in block scope does NOT shadow import in enclosing function', () => {
    const p = pos(
      [
        `import { x } from 'denied';`,
        `function f() {`,
        `  {`,
        `    const x = 1;`,
        `  }`,
        `  return x;`,
        `}`,
      ].join('\n'),
      'denied',
    )
    expect(p).toBeDefined()
    expect(p!.line).toBe(6)
  })

  test('var in nested arrow function does not shadow outer scope', () => {
    const p = pos(
      [
        `import { x } from 'denied';`,
        `const outer = () => {`,
        `  const inner = () => {`,
        `    var x = 1;`,
        `  };`,
        `  return x;`,
        `};`,
      ].join('\n'),
      'denied',
    )
    expect(p).toBeDefined()
    expect(p!.line).toBe(6)
  })
})

describe('findOriginalUnsafeUsagePos', () => {
  test('skips createServerFn handler usage in client env and finds later unsafe usage', () => {
    const p = originalPos(
      [
        `import { createServerFn } from '@tanstack/react-start';`,
        `import { getSecret } from './secret.server';`,
        `export const safeServerFn = createServerFn().handler(async () => {`,
        `  return getSecret();`,
        `});`,
        `export function leakyReference() {`,
        `  return getSecret();`,
        `}`,
      ].join('\n'),
      './secret.server',
      'client',
    )

    expect(p).toBeDefined()
    expect(p!.line).toBe(7)
  })

  test('returns undefined when usage is only inside createServerOnlyFn in client env', () => {
    const p = originalPos(
      [
        `import { createServerOnlyFn } from '@tanstack/react-start';`,
        `import { getSecret } from './secret.server';`,
        `export const safeServerOnly = createServerOnlyFn(() => {`,
        `  return getSecret();`,
        `});`,
      ].join('\n'),
      './secret.server',
      'client',
    )

    expect(p).toBeUndefined()
  })

  test('returns undefined when usage is only inside createMiddleware.server in client env', () => {
    const p = originalPos(
      [
        `import { createMiddleware } from '@tanstack/react-start';`,
        `import { getSecret } from './secret.server';`,
        `const middleware = createMiddleware({ type: 'function' }).server(({ next }) => {`,
        `  const secret = getSecret();`,
        `  return next({ context: { secret } });`,
        `});`,
      ].join('\n'),
      './secret.server',
      'client',
    )

    expect(p).toBeUndefined()
  })

  test('returns undefined when usage is only inside createIsomorphicFn.server in client env', () => {
    const p = originalPos(
      [
        `import { createIsomorphicFn } from '@tanstack/react-start';`,
        `import { getSecret } from './secret.server';`,
        `export const safeIsomorphic = createIsomorphicFn().server(() => {`,
        `  return getSecret();`,
        `});`,
      ].join('\n'),
      './secret.server',
      'client',
    )

    expect(p).toBeUndefined()
  })

  test('returns undefined when usage is only inside createClientOnlyFn in server env', () => {
    const p = originalPos(
      [
        `import { createClientOnlyFn } from '@tanstack/react-start';`,
        `import { readWindow } from './browser.client';`,
        `export const safeClientOnly = createClientOnlyFn(() => {`,
        `  return readWindow();`,
        `});`,
      ].join('\n'),
      './browser.client',
      'server',
    )

    expect(p).toBeUndefined()
  })
})

test.each([
  `createServerFn().handler((() => denied()))`,
  `(createServerFn)().handler(() => denied())`,
])(
  'preserves safe-boundary recognition through parentheses: %s',
  (expression) => {
    const code = `import { denied } from 'denied';\nexport const result = ${expression}`
    expect(findOriginalUnsafeUsagePos(code, 'denied', 'client')).toBeUndefined()
  },
)

test.each([
  `createIsomorphicFn().client((() => denied()))`,
  `(createClientOnlyFn)((() => denied()))`,
])('preserves server safe boundaries through parentheses: %s', (expression) => {
  const code = `import { denied } from 'denied';\nexport const result = ${expression}`
  expect(findOriginalUnsafeUsagePos(code, 'denied', 'server')).toBeUndefined()
})

test('does not treat an immediately invoked function as a safe handler argument', () => {
  const code = `import { denied } from 'denied';\nexport const result = createServerFn().handler((() => denied())())`
  expect(findOriginalUnsafeUsagePos(code, 'denied', 'client')).toEqual({
    line: 2,
    column0: code.split('\n')[1]!.indexOf('denied'),
  })
})

test('prefers parenthesized call usage over an earlier value reference', () => {
  const code = `import { denied } from 'denied';\nconst value = denied;\n(denied)()`
  expect(findPostCompileUsagePos(code, 'denied')).toEqual({
    line: 3,
    column0: 1,
  })
})

// On the client, `.handler()` (of createServerFn or a `*ServerFn` builder) and
// `.server()` (of createMiddleware, a `*Middleware` builder or
// createIsomorphicFn) are safe boundaries, matched by the root name of the
// call chain. On the server, the client branches are: createIsomorphicFn()
// .client() and createClientOnlyFn().
test.each([
  [
    'client',
    `createServerFn({ method: 'GET' }).validator((d) => d).handler(() => denied())`,
    true,
  ],
  ['client', `myServerFn.handler(() => denied())`, true],
  ['client', `authMiddleware.server(() => denied())`, true],
  ['client', `createIsomorphicFn().client(() => denied())`, false],
  ['server', `createServerFn().handler(() => denied())`, false],
] as const)('%s: %s is a safe boundary: %s', (env, expression, safe) => {
  const code = `import { denied } from 'denied';\nexport const result = ${expression}`
  expect(findOriginalUnsafeUsagePos(code, 'denied', env)).toEqual(
    safe
      ? undefined
      : { line: 2, column0: code.split('\n')[1]!.indexOf('denied()') },
  )
})

test('repeated lookups on one transform result return the cached position', () => {
  const code = `import { denied } from 'denied';\ndenied()`
  const result = { code, map: undefined, originalCode: undefined }
  const position = findOriginalUnsafeUsagePosFromResult(
    result,
    'denied',
    'client',
  )
  expect(position).toEqual({ line: 2, column0: 0 })
  expect(
    findOriginalUnsafeUsagePosFromResult(result, 'denied', 'client'),
  ).toEqual(position)
})
