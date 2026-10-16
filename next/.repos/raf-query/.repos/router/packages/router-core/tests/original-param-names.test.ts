import { expect, test } from 'vitest'
import {
  findFlatMatch,
  findRouteMatch,
  findSingleMatch,
  processRouteMasks,
} from '../src/new-process-route-tree'
import { processTestRouteTree as processRouteTree } from './routerTestUtils'

test('keeps original names when different templates share a trie prefix', () => {
  const tree = processRouteTree({
    id: '__root__',
    isRoot: true,
    fullPath: '/',
    children: [
      { id: '/$id/first', path: '$id/first', fullPath: '/$id/first' },
      {
        id: '/{$name}/second',
        path: '{$name}/second',
        fullPath: '/{$name}/second',
      },
    ],
  }).processedTree
  expect(findRouteMatch('/one/first', tree)?.rawParams).toEqual({ id: 'one' })
  expect(findRouteMatch('/two/second', tree)?.rawParams).toEqual({
    name: 'two',
  })
})

test("keeps a terminal route's names when a later alias adds a parser", () => {
  const tree = processRouteTree({
    id: '__root__',
    isRoot: true,
    fullPath: '/',
    children: [
      { id: '/$id/detail', path: '$id/detail', fullPath: '/$id/detail' },
      {
        id: '/$name',
        path: '$name',
        fullPath: '/$name',
        children: [
          {
            id: '/$name/detail',
            path: 'detail',
            fullPath: '/$name/detail',
            options: {
              params: { parse: (params: Record<string, string>) => params },
            },
          },
        ],
      },
    ],
  }).processedTree
  const match = findRouteMatch('/abc/detail', tree)
  expect(match?.route.id).toBe('/$id/detail')
  expect(match?.rawParams).toEqual({ id: 'abc' })
})

test('resumes through a route-less parse gate with skipped optional names', () => {
  const seen: Array<Record<string, string>> = []
  const tree = processRouteTree({
    id: '__root__',
    isRoot: true,
    fullPath: '/',
    children: [
      {
        id: '/$id',
        path: '$id',
        fullPath: '/$id',
        children: [
          {
            id: '/$id/_layout',
            fullPath: '/$id',
            options: {
              params: {
                parse: (params: Record<string, string>) => {
                  seen.push({ ...params })
                },
              },
            },
            children: [
              {
                id: '/$id/_layout/{-$lang}/$slug',
                path: '{-$lang}/$slug',
                fullPath: '/$id/{-$lang}/$slug',
              },
            ],
          },
        ],
      },
    ],
  }).processedTree
  expect(findRouteMatch('/one/post', tree)?.rawParams).toEqual({
    id: 'one',
    slug: 'post',
  })
  expect(findRouteMatch('/two/en/post', tree)?.rawParams).toEqual({
    id: 'two',
    lang: 'en',
    slug: 'post',
  })
  expect(seen).toEqual([{ id: 'one' }, { id: 'two' }])
})

test('retains nested mask branches without modifying their definitions', () => {
  const tree = processRouteTree({
    id: '__root__',
    fullPath: '/',
    isRoot: true,
  }).processedTree
  const child = Object.freeze({ from: '/$id/detail' })
  const mask = Object.freeze({ from: '/$id', children: [child] })
  processRouteMasks([mask], tree)
  const match = findFlatMatch('/one/detail', tree)
  expect(match?.route).toBe(child)
  expect(match?.rawParams).toEqual({ id: 'one' })
  expect(Object.keys(mask)).toEqual(['from', 'children'])
  expect(Object.keys(child)).toEqual(['from'])
})

test('retains mask and single-match names without modifying frozen definitions', () => {
  const tree = processRouteTree({
    id: '__root__',
    isRoot: true,
    fullPath: '/',
  }).processedTree
  const mask = Object.freeze({ from: '/pre{$code}/file' })
  processRouteMasks([mask], tree)
  expect(findFlatMatch('/prea%20b/file', tree)?.rawParams).toEqual({
    code: 'a b',
  })

  expect(Object.keys(mask)).toEqual(['from'])
  expect(
    findSingleMatch(
      '/{$first}/{-$middle}/$last',
      false,
      false,
      '/one/two',
      tree,
    )?.rawParams,
  ).toEqual({ first: 'one', last: 'two' })
})
