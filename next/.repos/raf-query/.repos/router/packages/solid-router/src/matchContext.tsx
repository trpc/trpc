import * as Solid from 'solid-js'
import type { AnyRouteMatch } from '@tanstack/router-core'

export type NearestMatchContextValue = readonly [
  routeId: Solid.Accessor<string | undefined>,
  match: Solid.Accessor<AnyRouteMatch | undefined>,
]

const defaultNearestMatchContext: NearestMatchContextValue = [
  () => undefined,
  () => undefined,
]

export const nearestMatchContext =
  Solid.createContext<NearestMatchContextValue>(defaultNearestMatchContext)
