import { bench, describe } from 'vitest'
import { dehydrateSsrMatchId } from '../src/ssr/ssr-match-id'

const typicalIds = Array.from(
  { length: 100 },
  (_, index) =>
    `/$orgId/projects/$projectId/acme/projects/project-${index}{"page":${index}}`,
)
const deepIds = Array.from(
  { length: 100 },
  (_, index) =>
    `${Array.from({ length: 32 }, (__, depth) => `/route-${depth}`).join('')}/${index}`,
)
let benchmarkSink = 0

describe('SSR match ID codec', () => {
  bench('encode 100 typical match IDs', () => {
    let size = 0
    for (const id of typicalIds) {
      size += dehydrateSsrMatchId(id).length
    }
    benchmarkSink = size
  })

  bench('encode 100 deep match IDs', () => {
    let size = 0
    for (const id of deepIds) {
      size += dehydrateSsrMatchId(id).length
    }
    benchmarkSink = size
  })
})

void benchmarkSink
