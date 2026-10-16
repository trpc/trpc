import { describe, expect, test } from 'vitest'
import { _getAssetMatches } from '../src'
import type { AnyRouteMatch } from '../src'

describe('_getAssetMatches', () => {
  test('does not cross an ordinary data-only pending boundary', () => {
    const matches = [
      { status: 'success' },
      { status: 'pending', ssr: 'data-only' },
      { status: 'success' },
    ] as Array<AnyRouteMatch>

    expect(_getAssetMatches(matches)).toEqual(matches.slice(0, 2))
  })

  test('limits a hydration handoff to its verified asset prefix', () => {
    const matches = [
      { status: 'success' },
      {
        status: 'pending',
        ssr: 'data-only',
        _assetEnd: 3,
      },
      { status: 'success' },
      { status: 'success' },
    ] as Array<AnyRouteMatch>

    expect(_getAssetMatches(matches)).toEqual(matches.slice(0, 3))
  })
})
