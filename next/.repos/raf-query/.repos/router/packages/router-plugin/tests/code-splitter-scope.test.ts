import { describe, expect, it } from 'vitest'
import {
  compileRouteModules,
  declarationOf,
  evaluateModule,
  expectValidModules,
  head,
  importSources,
  importedNames,
} from './regression-helpers'

const pageRoute = (body: string) => `${head}${body}
export const Route = createFileRoute('/')({ component: Page })
`

describe('a split component keeps the module bindings it reads', () => {
  it.each([
    {
      // Source: @vitejs/plugin-rsc hoist/function-hoist-block.js
      name: 'past a function declared in a nested block',
      body: `const value = 'outer'
function Page() {
  const seen = value
  {
    function value() {}
  }
  return seen
}`,
      expected: 'outer',
    },
    {
      // Source: @vitejs/plugin-rsc scope/param-default-var-hoisting.js
      name: 'from a parameter default next to a var of the same name',
      body: `const value = 'outer'
function Page(props, seen = value) {
  var value = 'inner'
  return seen + ':' + value
}`,
      expected: 'outer:inner',
    },
    {
      // Source: @vitejs/plugin-rsc scope/label.js
      name: 'next to a label of the same name',
      body: `const value = 'outer'
function Page() {
  value: for (const item of [1]) {
    if (item) {
      break value
    }
  }
  return value
}`,
      expected: 'outer',
    },
    {
      // Source: @vitejs/plugin-rsc hoist/catch-binding-shadow.js; React Compiler try-catch-* fixtures
      name: 'next to a catch parameter of the same name',
      body: `const err = { message: 'outer' }
function Page() {
  const readOuter = () => err.message
  try {
    throw new Error('inner')
  } catch (err) {
    return err.message + ':' + readOuter()
  }
}`,
      expected: 'inner:outer',
    },
    {
      // Source: @vitejs/plugin-rsc hoist/computed-destructuring-key-captures-outer-binding.js
      name: 'through a computed destructuring key',
      body: `const key = 'value'
function Page() {
  const { [key]: picked } = { value: 'picked' }
  return picked
}`,
      expected: 'picked',
    },
    {
      // Source: React Compiler destructure-*-default fixtures
      name: 'from parameter destructuring defaults',
      body: `const fallback = 'fb'
function Page({ title = fallback, items: [first = fallback.toUpperCase()] = [] }) {
  return <p>{title}{first}</p>
}`,
      expected: '<p>fbFB</p>',
    },
    {
      // Source: React Compiler optional-call-chain-*.js
      name: 'through optional call chains',
      body: `const helpers = { format: (v) => '[' + v + ']' }
function Page() {
  return <p>{helpers?.format?.('a')}{helpers.missing?.(1) ?? '-'}</p>
}`,
      expected: '<p>[a]-</p>',
    },
    {
      // Source: React Compiler tagged-template-literal.js
      name: 'as a template tag',
      body: `const tag = (strings, ...values) => strings.raw.join('|') + values.join(',')
function Page() {
  return <p>{tag\`a\${1}b\${2}c\`}</p>
}`,
      expected: '<p>a|b|c1,2</p>',
    },
    {
      // Source: React Compiler class fixtures; @vitejs/plugin-rsc hoist/class-declaration-in-body.js
      name: 'from the static block of a local class',
      body: `const base = 2
function Page() {
  class Counter {
    static start
    static {
      Counter.start = base * 2
    }
    #n = Counter.start
    get n() {
      return this.#n
    }
  }
  return <p>{new Counter().n}</p>
}`,
      expected: '<p>4</p>',
    },
  ])('$name', async ({ body, expected }) => {
    const { modules } = compileRouteModules(pageRoute(body))
    await expectValidModules(modules)
    const chunk = await evaluateModule(modules['virtual component']!)
    expect(chunk.component!({})).toBe(expected)
  })
})

describe('names a route option declares itself do not reference module bindings', () => {
  it.each([
    {
      // Source: Next.js ssg/getStaticProps/should-not-mix-up-bindings
      name: 'locals and a named function expression in the split component',
      options: `loader: () => [label, format()],
  component: () => {
    const label = 'local'
    const obj = { a: function format(x: number) { return x } }
    return <div>{label}{obj.a(1)}</div>
  },`,
    },
    {
      // Source: Next.js ssg/getServerSideProps/query-usage
      name: 'a local in the loader',
      options: `loader: () => {
    const label = 'local'
    return label
  },
  component: () => <div>{label}{format()}</div>,`,
    },
    {
      // Source: Next.js ssg/getServerSideProps/query-usage
      name: 'destructured parameters',
      options: `loader: ({ label }: any) => [label, format()],
  component: ({ format }: any) => <div>{format}{label}</div>,`,
    },
    {
      // Source: Qwik optimizer test.rs should_not_auto_export_var_shadowed_in_{catch,do_while,switch,labeled_block}
      name: 'block-scoped names in the split component',
      options: `loader: () => [label, format()],
  component: ({ kind }: any) => {
    try { JSON.parse(kind) } catch (label) { console.log(label) }
    let i = 0
    do { const label = i; i += label + 1 } while (i < 3)
    switch (kind) { case 'a': { const label = 'case'; console.log(label) } }
    block: { const format = 'labeled'; if (format) break block }
    return <p>{i}</p>
  },`,
    },
  ])('$name', async ({ options }) => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}import { load } from './load'
const label = load()
function format() { return 'format' }
export const Route = createFileRoute('/')({
  ${options}
})
`)
    // A name both options really read would be shared between them.
    expect(sharedBindings).toEqual([])
    await expectValidModules(modules)
  })

  // Source: Next.js ssg/getStaticProps/should-not-remove-import-used-in-render
  it('neither do intrinsic tag and attribute names, unlike component tags and JSX expressions', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}import { A, B } from './ui'
import { load } from './load'
const a = load()
const p = load()
const label = load()
export const Route = createFileRoute('/')({
  loader: () => [a, p, label],
  component: () => (
    <p label="x" title={<A />}>
      <a href="/">home</a>
      <B.Deep.C />
    </p>
  ),
})
`)
    expect(sharedBindings).toEqual([])
    expect(importedNames(modules['virtual component']!, './ui')).toEqual([
      'A',
      'B',
    ])
    expect(importSources(modules.reference!)).not.toContain('./ui')
    await expectValidModules(modules)
  })

  // Source: React Router route-chunks-test.ts "computed object property"
  it('neither do object keys, unlike computed keys', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}import { load } from './load'
const label = load()
const kind = 'kind'
export const Route = createFileRoute('/')({
  loader: () => [label, kind],
  component: () => {
    const obj = { label: 1, [kind]: 2 }
    return <div>{obj.label}</div>
  },
})
`)
    expect(sharedBindings).toEqual(['kind'])
    await expectValidModules(modules)
  })
})

describe('imports read in nested positions follow the code that reads them', () => {
  // Source: React Router route-chunks-test.ts "default argument", "destructured
  // argument with default value", "for...of with destructuring and default
  // value", "try catch" and "generator function"; Turbopack tree-shaker analyzer/typeof-1
  it.each([
    {
      name: 'a default parameter',
      helper: 'const read = (value = x) => value',
    },
    {
      name: 'a destructuring default',
      helper: 'const read = ([{ value }] = [{ value: x }]) => value',
    },
    {
      name: 'a for-of destructuring default',
      helper: `const read = () => {
  for (const { value = x } of [{}]) {
    return value
  }
}`,
    },
    {
      name: 'a catch clause',
      helper: `const read = () => {
  try {
    throw 0
  } catch {
    return x
  }
}`,
    },
    { name: 'a generator', helper: 'const read = function* () { yield x }' },
    { name: 'a typeof operand', helper: 'const read = () => typeof x' },
  ])('$name', async ({ helper }) => {
    const { modules } = compileRouteModules(`${head}import { x } from './x'
${helper}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{String(read())}</p>,
})
`)
    expect(modules['virtual component']).toMatch(declarationOf('read'))
    expect(importedNames(modules['virtual component']!, './x')).toEqual(['x'])
    expect(importSources(modules.reference!)).not.toContain('./x')
    await expectValidModules(modules)
  })

  it.each([
    {
      // Source: @vitejs/plugin-rsc hoist/function-hoist-block.js
      name: 'past a function declared in a nested block',
      loader: `() => {
  {
    function store() {}
  }
  return store.value
}`,
    },
    {
      // Source: @vitejs/plugin-rsc scope/param-default-var-hoisting.js
      name: 'from a parameter default next to a var of the same name',
      loader: `(ctx, value = store.value) => {
  var store = 'local'
  return value
}`,
    },
    {
      // Source: @vitejs/plugin-rsc hoist/catch-binding-shadow.js
      name: 'in a try block whose catch parameter shadows it',
      loader: `() => {
  try {
    return store.value
  } catch (store) {
    return store
  }
}`,
    },
  ])('keeps an import the loader reads $name', async ({ loader }) => {
    const { modules } =
      compileRouteModules(`${head}import { store } from './store'
function Page() {
  return 'page'
}
export const Route = createFileRoute('/')({ loader: ${loader}, component: Page })
`)
    expect(importedNames(modules.reference!, './store')).toEqual(['store'])
    await expectValidModules(modules)
  })
})

describe('plain JavaScript route files', () => {
  // In JavaScript, `a < b > (c)` is two comparisons, not a call with a type
  // argument, so `b` is a value the expression reads.
  it('reads every operand of a chained comparison', () => {
    const { sharedBindings } = compileRouteModules(
      `${head}const a = 1, b = 2, c = 3
const r = a < b > (c)
export const Route = createFileRoute('/compare')({
  loader: () => r,
  component: () => <p>{String(r)}</p>,
})
`,
      { filename: 'route.js' },
    )
    expect(sharedBindings).toEqual(['a', 'b', 'c', 'r'])
  })
})
