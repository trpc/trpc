import { bench, describe } from 'vitest'
import { memoryBenchOptions } from '#memory-server/bench-utils'
import { workloadGroup } from './setup'

await workloadGroup.sanity()

const workload = workloadGroup.workloads[3]!

describe('memory', () => {
  bench(workload.name, workload.run, memoryBenchOptions)
})
