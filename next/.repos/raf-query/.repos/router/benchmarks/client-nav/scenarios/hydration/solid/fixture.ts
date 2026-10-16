export {
  clientUrl,
  hashLinkCount,
  ordinaryLinkCount,
  serverUrl,
} from '../react/fixture'
export type { FixtureArtifact } from '../react/fixture'

export interface Diagnostics {
  beforeLoads: number
  loaders: number
  mounted: boolean
  rendered: number
  clicks: number
  countUpdates: boolean
  ordinaryEvaluations: number
  hashEvaluations: number
  initialHashStates: Array<boolean>
  hashStates: Array<boolean>
}

export function createDiagnostics(countUpdates = false): Diagnostics {
  return {
    beforeLoads: 0,
    loaders: 0,
    mounted: false,
    rendered: 0,
    clicks: 0,
    countUpdates,
    ordinaryEvaluations: 0,
    hashEvaluations: 0,
    initialHashStates: [],
    hashStates: [],
  }
}
