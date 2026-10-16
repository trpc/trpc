export const ordinaryLinkCount = 192
export const hashLinkCount = 8
export const serverUrl = '/teams/team-7/items/item-42?view=summary'
export const clientUrl = `${serverUrl}#details`

export interface Diagnostics {
  beforeLoads: number
  loaders: number
  mounted: boolean
  clicks: number
  ordinaryRenders: number
  hashRenders: number
  countRenders: boolean
}

export function createDiagnostics(countRenders = false): Diagnostics {
  return {
    beforeLoads: 0,
    loaders: 0,
    mounted: false,
    clicks: 0,
    ordinaryRenders: 0,
    hashRenders: 0,
    countRenders,
  }
}

export interface FixtureArtifact {
  html: string
  scripts: Array<string>
}
