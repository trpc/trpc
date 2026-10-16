import { describe, expect, test } from 'vitest'
import {
  compileCode,
  evaluateModule,
  importSources,
} from './regression-helpers'
import { declarationOf, getModuleErrors } from './validate-module'

// The compiler removes code that only served a transformed call. Everything
// else is user code that must survive, even when nothing seems to read it.

// A declaration that only references itself, or a sibling that references
// it back, is still live: its initializer runs side effects.
test.each([
  {
    name: 'a self-clearing interval',
    sideEffect: 'setInterval(',
    declared: ['interval'],
    code: `import { createServerFn } from '@tanstack/react-start'
const interval = setInterval(() => {
  clearInterval(interval)
}, 1000)
export const fn = createServerFn().handler(async () => 1)`,
  },
  {
    name: 'mutually-referencing declarations',
    sideEffect: 'createPersister(',
    declared: ['persister', 'restore'],
    code: `import { createServerFn } from '@tanstack/react-start'
import { createPersister } from './persist'
const persister = createPersister({ onRestore: () => restore() })
function restore() {
  persister.restore()
}
export const fn = createServerFn().handler(async () => 1)`,
  },
])('keeps $name', async ({ code, sideEffect, declared }) => {
  const client = await compileCode('client', code)
  expect(client).toContain(sideEffect)
  // The validator does not report references to undeclared names.
  for (const name of declared) {
    expect(client).toMatch(declarationOf(name))
  }
  expect(await getModuleErrors(client!)).toEqual([])
})

// TypeScript erases type positions, so a declaration whose binding only
// appears in a type is still live JavaScript: its initializer runs once at
// import time.
describe('keeps a declaration only referenced from types', () => {
  const typeQuery = {
    name: 'a typeof type query',
    marker: 'analytics-marker',
    declared: 'analytics',
    imported: './analytics',
    code: `import { createServerFn } from '@tanstack/react-start'
import { registerAnalytics } from './analytics'
const analytics = registerAnalytics('analytics-marker')
type Analytics = typeof analytics
export function describeClient(client?: Analytics) {
  return client ? 'custom' : 'default'
}
export const getPosts = createServerFn().handler(async () => [])`,
  }
  const globalAugmentation = {
    name: 'a global augmentation',
    marker: 'store-marker',
    declared: 'store',
    imported: './store',
    code: `import { createIsomorphicFn } from '@tanstack/react-start'
import { createStore } from './store'
const store = createStore('store-marker')
declare global {
  interface Window {
    appStore?: typeof store
  }
}
export const getKind = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')`,
  }

  test.each([
    { output: 'client', ...typeQuery },
    { output: 'client', ...globalAugmentation },
    { output: 'provider', ...typeQuery },
  ] as const)(
    '$output: $name',
    async ({ output, code, marker, declared, imported }) => {
      const compiled = await compileCode(output, code)
      expect(compiled).toContain(marker)
      expect(compiled).toMatch(declarationOf(declared))
      expect(importSources(compiled!)).toContain(imported)
      expect(await getModuleErrors(compiled!)).toEqual([])
    },
  )
})

test('accepts a TypeScript type and a value exported under the same name', async () => {
  const client = await compileCode(
    'client',
    `import { createServerFn } from '@tanstack/react-start'
export type User = { name: string }
function User(name: string): User {
  return { name }
}
export { User }
export const getUser = createServerFn().handler(async () => User('Ada'))`,
  )
  const module = await evaluateModule(client!)
  expect(module.User('Ada')).toEqual({ name: 'Ada' })
})

test('keeps a React import the classic JSX runtime needs', async () => {
  // With the classic runtime the bundler compiles JSX to React.createElement
  // after this compiler ran, so an import only used in types is still needed.
  const client = await compileCode(
    'client',
    `import * as React from 'react'
import { createServerFn } from '@tanstack/react-start'
export const getGreeting = createServerFn().handler(async () => 'hi')
export function Greeting({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>
}`,
  )
  expect(importSources(client!)).toEqual(['react'])
})

test('keeps a namespace only read through a TypeScript import alias', async () => {
  // `import red = Labels.red` compiles to `var red = Labels.red`.
  const client = await compileCode(
    'client',
    `import { createServerFn } from '@tanstack/react-start'
namespace Labels {
  export const red = 'red'
}
import red = Labels.red
export const label = red
export const fn = createServerFn().handler(async () => red)`,
  )
  expect((await evaluateModule(client!)).label).toBe('red')
})
