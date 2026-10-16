import { expect, test } from 'vitest'
import {
  compileFirstChunk,
  compileHydrate,
  evaluateModule,
  getChunkIds,
  getChunkParams,
  hydrateParentStubs,
  loadChunk,
  renderChunk,
} from './regression-helpers'
import { declarationOf, getModuleErrors } from './validate-module'

// `<Hydrate>` moves its children into a chunk component at module level. The
// locals of the enclosing scopes the children read become props of that
// component, under the same names; module bindings move along with the
// children; names the children declare themselves are not captured. React
// keeps the `key` and `ref` props for itself, so no captured local here is
// named like them.

const head = `import { Hydrate } from '@tanstack/react-start'\n`

/** Compiles for the client, checks every module and returns the single chunk. */
async function compileChunk(code: string) {
  const { parent, chunks } = await compileHydrate('client', `${head}${code}`)
  expect(chunks).toHaveLength(1)
  for (const module of [parent, chunks[0]!]) {
    expect(await getModuleErrors(module)).toEqual([])
  }
  return { parent, chunk: chunks[0]! }
}

test.each<{
  name: string
  children: string
  params: Array<string>
  expected: string
}>([
  {
    // Source: @vitejs/plugin-rsc hoist/function-hoist-block.js
    name: 'past a function declared in a nested block',
    children: `{(() => {
  const seen = value
  {
    function value() {}
  }
  return seen
})()}`,
    params: ['value'],
    expected: '<p>outer</p>',
  },
  {
    // Source: @vitejs/plugin-rsc scope/param-default-var-hoisting.js
    name: 'from a parameter default next to a var of the same name',
    children: `{((seen = value) => {
  var value = 'inner'
  return seen + ':' + value
})()}`,
    params: ['value'],
    expected: '<p>outer:inner</p>',
  },
  {
    // Source: @vitejs/plugin-rsc scope/label.js
    name: 'next to a label of the same name',
    children: `{(() => {
  value: for (const item of [1]) {
    if (item) {
      break value
    }
  }
  return value
})()}`,
    params: ['value'],
    expected: '<p>outer</p>',
  },
  {
    // Source: @vitejs/plugin-rsc hoist/computed-destructuring-key-captures-outer-binding.js
    name: 'through a computed destructuring key',
    children: `{(({ [field]: picked }) => picked)({ value })}`,
    params: ['field', 'value'],
    expected: '<p>outer</p>',
  },
  {
    // Source: @vitejs/plugin-rsc hoist/var-hoist-block.js, hoist/shadow-var-nested-block.js
    name: 'unless a var in a nested block shadows them',
    children: `{(() => {
  if (field) {
    var value = 'inner'
  }
  return value
})()}`,
    params: ['field'],
    expected: '<p>inner</p>',
  },
  {
    // Source: SolidStart compile.spec.ts "allows `this` and `arguments` in a
    // function expression"
    name: 'except the arguments of a function expression',
    children: `{(function (..._args: Array<unknown>) {
  return arguments.length
})(1, 2)}`,
    params: [],
    expected: '<p>2</p>',
  },
])(
  'client: the children capture locals $name',
  async ({ children, params, expected }) => {
    const { chunk } = await compileChunk(`export function Page() {
  const value = 'outer'
  const field = 'value'
  return <Hydrate><p>${children}</p></Hydrate>
}`)
    expect(getChunkParams(chunk)).toEqual(params)
    expect(await renderChunk(chunk, { value: 'outer', field: 'value' })).toBe(
      expected,
    )
  },
)

// Source: @vitejs/plugin-rsc hoist/function-hoist-block.js (module-level binding)
test('client: a module binding read past a block-level function moves into the chunk', async () => {
  const { chunk } = await compileChunk(`const value = 'module'
export function Page() {
  return <Hydrate><p>{(() => {
  const seen = value
  {
    function value() {}
  }
  return seen
})()}</p></Hydrate>
}`)
  expect(getChunkParams(chunk)).toEqual([])
  expect(await renderChunk(chunk)).toBe('<p>module</p>')
})

// Source: Qwik optimizer should_not_auto_export_var_shadowed_in_catch
test('client: a catch parameter is captured', async () => {
  const { chunk } = await compileChunk(`export function Page() {
  try {
    throw new Error('caught')
  } catch (error) {
    return <Hydrate><p>{error.message}</p></Hydrate>
  }
}`)
  expect(getChunkParams(chunk)).toEqual(['error'])
  expect(await renderChunk(chunk, { error: new Error('caught') })).toBe(
    '<p>caught</p>',
  )
})

// Source: Qwik optimizer should_transform_handler_in_for_of_loop
test('client: a destructured loop variable and a block-scoped local are captured, module helpers move', async () => {
  const { parent, chunk } = await compileChunk(`function Row({ v }) {
  return <li>{v}</li>
}
export function Page({ entries }) {
  const out = []
  for (const [key, value] of entries) {
    const label = key + '-'
    out.push(<Hydrate key={key}><Row v={label + value} /></Hydrate>)
  }
  return <ul>{out}</ul>
}`)
  expect(getChunkParams(chunk)).toEqual(['label', 'value'])
  // The helper only the children use leaves the parent with them.
  expect(parent).not.toMatch(declarationOf('Row'))
  expect(await renderChunk(chunk, { label: 'a-', value: 1 })).toBe(
    '<li>a-1</li>',
  )
})

// Source: Qwik optimizer jsx_tag_names_are_not_segment_uses,
// jsx_lowercase_tag_outside_segments, jsx_tag_named_like_inlined_const
test.each([
  {
    scope: 'module',
    code: `const div = sideEffect('div')
console.log(div)
export function Page() {
  return <Hydrate><div>x</div></Hydrate>
}`,
  },
  {
    scope: 'component',
    code: `export function Page() {
  const div = sideEffect('div')
  console.log(div)
  return <Hydrate><div>x</div></Hydrate>
}`,
  },
])(
  'client: a $scope binding named like an intrinsic tag is not captured',
  async ({ code }) => {
    const { chunk } = await compileChunk(code)
    expect(chunk).not.toContain('sideEffect')
    expect(getChunkParams(chunk)).toEqual([])
    expect(await renderChunk(chunk)).toBe('<div>x</div>')
  },
)

// Source: Qwik optimizer local_shadowing_destructured_prop,
// should_not_auto_export_var_shadowed_in_catch
test('client: names the children declare themselves are not captured', async () => {
  const { chunk } = await compileChunk(`export function Page({ value }) {
  const x = 'outer'
  console.log(x)
  return <Hydrate>
    <input value={value} onChange={(e) => { const value = e.target.value; return value }} />
    <p>{(() => { try { throw new Error('e') } catch (err) { const x = 'catch:' + err.message; return x } })()}</p>
  </Hydrate>
}`)
  expect(getChunkParams(chunk)).toEqual(['value'])
  expect(await renderChunk(chunk, { value: 'v' })).toBe(
    '<input></input><p>catch:e</p>',
  )
})

// Source: Qwik optimizer example_functional_component_capture_props,
// example_spread_jsx, should_convert_rest_props
test('client: destructured params with defaults and rests, and spread props, are captured', async () => {
  const { chunk } =
    await compileChunk(`function Child(props) { return <b>{props.a + props.extra}</b> }
export function Page({ a: [b = 1], ...c }) {
  const extra = '!'
  return <Hydrate><p>{b}</p><Child {...c} {...{ extra }} /></Hydrate>
}`)
  expect(getChunkParams(chunk)).toEqual(['b', 'c', 'extra'])
  expect(await renderChunk(chunk, { b: 1, c: { a: 'A' }, extra: '!' })).toBe(
    '<p>1</p><b>A!</b>',
  )
})

// Split children move to a module-level chunk component, so only runtime
// values may become props.
// Source: Qwik optimizer should_wrap_type_asserted_variables_in_template;
// SolidStart compile.spec.ts "does not read type annotations as captured values"
test('client: local types used by the children are not captured', async () => {
  const { chunk } = await compileChunk(`import type { Shape } from './types'
function format<T>(value: T) { return String(value) }
function List<T>(props: { items: Array<T> }) { return <ul>{props.items.length}</ul> }
export function Page({ v }: { v: unknown }) {
  type Local = string
  interface Box { value: Local }
  return <Hydrate><List<Box> items={[v] as Array<Shape>} /><p>{format<Local>(v as Local) + (v satisfies unknown as Box['value'] as Shape)}</p></Hydrate>
}`)
  expect(getChunkParams(chunk)).toEqual(['v'])
  expect(await renderChunk(chunk, { v: 'x' })).toBe('<ul>1</ul><p>xx</p>')
})

// Source: Qwik optimizer example_qwik_conflict, import_collision_with_renaming
test('client: generated names do not collide with user bindings or imports', async () => {
  const { parent, chunk } =
    await compileChunk(`import { lazyRouteComponent } from '@tanstack/react-router'
const _lazyRouteComponent = 'user'
export const Lazy = lazyRouteComponent(() => import('./other'))
export function Page() {
  const _H0 = 'local'
  const _H0_preload = 'preload'
  return <Hydrate prefetch><p>{_lazyRouteComponent + _H0 + _H0_preload}</p></Hydrate>
}`)
  // The lazy chunk component must not be shadowed by the captured locals.
  const module = await evaluateModule(parent, hydrateParentStubs)
  expect(module.Page()).toBe('[lazy(_H0=local,_H0_preload=preload)]')
  expect(
    await renderChunk(chunk, { _H0: 'local', _H0_preload: 'preload' }),
  ).toBe('<p>userlocalpreload</p>')
})

// Source: Qwik optimizer example_capture_imports, example_qwik_conflict
test('client: a captured local shadowing an import or module binding wins inside the children only', async () => {
  const { chunk } = await compileChunk(`import { label } from './labels'
import { Row } from './row'
const value = 'module'
function Show() { return <b>{value + ':' + label}</b> }
export function Page() {
  const label = 'local'
  const value = 'local-value'
  return <Hydrate><Row text={label} /><Show /><i>{value}</i></Hydrate>
}`)
  expect(getChunkParams(chunk)).toEqual(['label', 'value'])
  expect(
    await renderChunk(
      chunk,
      { label: 'local', value: 'local-value' },
      {
        './labels': { label: 'imported' },
        './row': { Row: ({ text }: { text: string }) => `<r>${text}</r>` },
      },
    ),
  ).toBe('<r>local</r><b>module:imported</b><i>local-value</i>')
})

// Source: Qwik optimizer nested_segment_param_does_not_collide_with_captured_props
test('client: a nested boundary receives the captures of its enclosing boundary', async () => {
  const { parent, chunks, plugin } = await compileHydrate(
    'client',
    `${head}export function Page({ isOpen, fee }) {
  const label = 'fee'
  return <Hydrate><section><Hydrate><p>{label + ':' + (isOpen ? fee : 0)}</p></Hydrate></section></Hydrate>
}`,
  )
  expect(getChunkParams(chunks[0]!)).toEqual(['fee', 'isOpen', 'label'])
  const outer = await compileFirstChunk(plugin, parent)
  const inner = loadChunk(plugin, 'client', getChunkIds(outer.code!)[0]!)
  expect(getChunkParams(inner!)).toEqual(['fee', 'isOpen', 'label'])
  expect(
    await renderChunk(inner!, { label: 'fee', isOpen: true, fee: 5 }),
  ).toBe('<p>fee:5</p>')
})
