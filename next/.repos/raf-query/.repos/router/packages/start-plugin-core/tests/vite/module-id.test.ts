import { describe, expect, test } from 'vitest'
import {
  appendIdQueryFlag,
  hasIdQueryFlag,
  removeIdQueryFlag,
} from '../../src/vite/module-id'

const flag = 'server-fn-module-lookup'

describe('hasIdQueryFlag', () => {
  test.each([
    ['/src/route.ts', false],
    [`/src/route.ts?${flag}`, true],
    [`/src/route.ts?mode=dev&${flag}`, true],
    [`/src/route.ts?${flag}=enabled`, true],
    [`/src/route.ts?mode=${flag}`, false],
    [`/src/route.ts?${flag}-suffix`, false],
  ])('checks the query parameter name in %s', (id, expected) => {
    expect(hasIdQueryFlag(id, flag)).toBe(expected)
  })
})

describe('appendIdQueryFlag', () => {
  test.each([
    ['/src/route.ts', `/src/route.ts?${flag}`],
    ['/src/route.ts?mode=dev', `/src/route.ts?mode=dev&${flag}`],
    ['/src/route.ts?', `/src/route.ts?&${flag}`],
    ['/src/route.ts?mode=dev&', `/src/route.ts?mode=dev&${flag}`],
  ])('appends the flag to %s', (id, expected) => {
    expect(appendIdQueryFlag(id, flag)).toBe(expected)
  })
})

describe('removeIdQueryFlag', () => {
  test.each([
    [`/src/route.ts?${flag}`, '/src/route.ts'],
    [`/src/route.ts?mode=dev&${flag}`, '/src/route.ts?mode=dev'],
    [`/src/route.ts?${flag}&mode=dev`, `/src/route.ts?${flag}&mode=dev`],
    ['/src/route.ts?mode=dev', '/src/route.ts?mode=dev'],
  ])('removes only an appended flag from %s', (id, expected) => {
    expect(removeIdQueryFlag(id, flag)).toBe(expected)
  })
})

describe('module ID query flag round trip', () => {
  test.each([
    '/src/route.ts',
    '/src/route.ts?',
    '/src/route.ts?variant=client',
    '\0virtual:factory?variant=client&encoded=a%2Fb',
    `/src/route.ts?${flag}`,
  ])('preserves the original ID %s', (id) => {
    const withFlag = appendIdQueryFlag(id, flag)
    expect(removeIdQueryFlag(withFlag, flag)).toBe(id)
  })
})
