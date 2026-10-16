import { transformWithOxc } from 'vite'
import { expect, test } from 'vitest'
import { createHydrateCompilerPlugin } from '../src/hydrate-when-transform'
import { compileCode, compileHydrate } from './regression-helpers'

/**
 * A file-level JSX pragma decides which JSX runtime the bundler's own JSX
 * transform uses for the module. The Start compiler runs before that
 * transform (`enforce: 'pre'`), so it must not drop the pragma when it removes
 * the import statement the comment sits on.
 */
async function transformJsx(code: string) {
  const result = await transformWithOxc(code, 'module.tsx', {
    jsx: { runtime: 'automatic', importSource: 'react' },
  })
  return result.code
}

/** The JSX runtime Oxc (Vite 8's JSX transform) selects for compiled output. */
async function jsxRuntimeOf(code: string) {
  return (await transformJsx(code)).match(
    /from ["']([^"']+\/jsx-(?:dev-)?runtime)["']/,
  )?.[1]
}

// Each comment form sits on the import of a factory the compiler removes; the
// factory and output only vary to show any removed import qualifies.
test.each([
  {
    name: 'a block comment',
    output: 'client',
    kept: '@jsxImportSource @emotion/react',
    code: `/** @jsxImportSource @emotion/react */
import { createIsomorphicFn } from '@tanstack/react-start'
const where = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')
export function Card() {
  return <div css={{ color: 'hotpink' }}>{where()}</div>
}`,
  },
  {
    name: 'a line comment',
    output: 'ssr',
    kept: '@jsxImportSource @emotion/react',
    code: `// @jsxImportSource @emotion/react
import { createClientOnlyFn } from '@tanstack/react-start'
const track = createClientOnlyFn(() => window.alert('tracked'))
export function Button() {
  return <button css={{ color: 'hotpink' }} onClick={() => track()} />
}`,
  },
  {
    name: 'a file header comment',
    output: 'client',
    kept: 'Copyright Example Corp.',
    code: `/**
 * Copyright Example Corp.
 * @jsxImportSource @emotion/react
 */
import { createServerOnlyFn } from '@tanstack/react-start'
const readSecret = createServerOnlyFn(() => process.env.SECRET)
export function Panel() {
  return <p css={{ color: 'hotpink' }} onClick={() => readSecret()} />
}`,
  },
] as const)(
  '$output: a @jsxImportSource pragma in $name survives the removal of the import it sits on',
  async ({ output, code, kept }) => {
    const compiled = await compileCode(output, code)
    expect(await jsxRuntimeOf(compiled!)).toBe('@emotion/react/jsx-runtime')
    expect(compiled).toContain(kept)
  },
)

test('client: classic @jsx and @jsxFrag pragmas survive the removal of the import they sit on', async () => {
  const client = await compileCode(
    'client',
    `/** @jsxRuntime classic */
// @jsx h
// @jsxFrag Fragment
import { createIsomorphicFn } from '@tanstack/react-start'
import { h, Fragment } from 'preact'
const where = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')
export function List() {
  return <>{where()}</>
}`,
  )
  expect(await transformJsx(client!)).toMatch(/\bh\(Fragment\b/)
})

test('client: a pragma after a directive stays ahead of inserted server function imports', async () => {
  const client = await compileCode(
    'client',
    `'use client'
/** @jsxImportSource @emotion/react */
import { createServerFn } from '@tanstack/react-start'
export const getGreeting = createServerFn().handler(async () => 'hi')
export function Card() {
  return <div css={{ color: 'hotpink' }}>card</div>
}`,
  )
  expect(client!.match(/@jsxImportSource/g)).toHaveLength(1)
  expect(await jsxRuntimeOf(client!)).toBe('@emotion/react/jsx-runtime')
})

test('client: a Hydrate chunk keeps the file-level @jsxImportSource pragma', async () => {
  const { chunks } = await compileHydrate(
    'client',
    `/** @jsxImportSource @emotion/react */
import { Hydrate } from '@tanstack/react-start'
export function Card() {
  return (
    <Hydrate>
      <div css={{ color: 'hotpink' }}>card</div>
    </Hydrate>
  )
}`,
  )
  expect(await jsxRuntimeOf(chunks[0]!)).toBe('@emotion/react/jsx-runtime')
})

test('client: the parent keeps the pragma when the import it sits on moves into a Hydrate chunk', async () => {
  // Vite 7 and earlier transform JSX with esbuild, which honours the pragma
  // wherever it appears; check the comment itself survives.
  const parent = await compileCode(
    'client',
    `/** @jsxImportSource @emotion/react */
import { Widget } from './widget'
import { Hydrate } from '@tanstack/react-start'
export function Card() {
  return (
    <div css={{ color: 'hotpink' }}>
      <Hydrate>
        <Widget />
      </Hydrate>
    </div>
  )
}`,
    { compilerPlugins: [createHydrateCompilerPlugin()] },
  )
  expect(parent).toContain('@jsxImportSource @emotion/react')
})
