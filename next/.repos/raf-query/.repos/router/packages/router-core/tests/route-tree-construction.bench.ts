import { bench, describe, expect } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { findRouteMatch, processRouteTree } from '../src/new-process-route-tree'
import type { AnyRoute } from '../src'

type Shape = 'static' | 'dynamic' | 'nested' | 'mixed'

function createTree(count: number, shape: Shape) {
  const root = new BaseRootRoute({})
  const child = (parent: AnyRoute, path: string) =>
    new BaseRoute({ getParentRoute: () => parent, path })
  if (shape === 'nested') {
    return root.addChildren(
      Array.from({ length: count / 10 }, (_, group) => {
        const parent = child(root, `/orgs/group-${group}/$org`)
        return parent.addChildren(
          Array.from({ length: 9 }, (_, index) =>
            child(parent, `/items/section-${index}/$id`),
          ),
        )
      }),
    )
  }
  return root.addChildren(
    Array.from({ length: count }, (_, index) => {
      const path =
        shape === 'static'
          ? `/static-${index}/about`
          : shape === 'dynamic'
            ? `/section-${index}/$id`
            : [
                `/mixed-${index}/$org/items/$id`,
                `/mixed-${index}/{-$lang}/$id`,
                `/mixed-${index}/pre{$id}suffix/{-$lang}`,
                `/mixed-${index}/files/prefix{$}.txt`,
              ][index % 4]!
      return child(root, path)
    }),
  )
}

// Keep first-use interpolation and object allocation out of the processing-only case.
for (const count of [100, 1000, 10000]) {
  describe.each<Shape>(['static', 'dynamic', 'nested', 'mixed'])(
    `route-tree construction (${count} routes, %s)`,
    (shape) => {
      let tree = createTree(count, shape)
      let result = processRouteTree<AnyRoute>(tree)
      const expectedPath =
        shape === 'static'
          ? '/static-0/about'
          : shape === 'dynamic'
            ? '/section-0/one'
            : shape === 'nested'
              ? '/orgs/group-0/one/items/section-0/two'
              : '/mixed-0/one/items/two'
      const verify = () => {
        expect(Object.keys(result.routesById)).toHaveLength(count + 1)
        expect(
          findRouteMatch(expectedPath, result.processedTree),
        ).not.toBeNull()
      }
      verify()

      bench(
        'processRouteTree + route.init on fresh objects',
        () => {
          result = processRouteTree<AnyRoute>(tree)
        },
        {
          setup: (task) => {
            // Vitest forwards Bench options, not per-iteration Task options.
            task.opts.beforeEach = () => {
              tree = createTree(count, shape)
            }
          },
          teardown: verify,
          time: 1500,
          warmupTime: 500,
          throws: true,
        },
      )

      bench(
        'route objects + processRouteTree + route.init',
        () => {
          result = processRouteTree<AnyRoute>(createTree(count, shape))
        },
        {
          teardown: verify,
          time: 1500,
          warmupTime: 500,
          throws: true,
        },
      )
    },
  )
}
