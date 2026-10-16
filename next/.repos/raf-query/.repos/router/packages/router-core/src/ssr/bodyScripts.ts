import { _getAssetMatches } from '../load-client'
import type { Manifest, RouterManagedTag } from '../manifest'
import type { AnyRouteMatch } from '../Matches'
import type { InitialHydrationScriptTags } from './hydrationScripts'

type ScriptTags = Array<RouterManagedTag>
export type SsrBodyScriptParts = readonly [ScriptTags, ScriptTags]

export function getSsrBodyScriptParts(
  matches: Array<AnyRouteMatch>,
  manifest: Manifest | undefined,
  nonce: string | undefined,
  routeScriptAttrs?: Record<string, unknown>,
): SsrBodyScriptParts {
  const assetMatches = _getAssetMatches(matches)
  const routeScripts: ScriptTags = []
  const manifestScripts: ScriptTags = []
  for (const match of assetMatches) {
    for (const script of Array.isArray(match.scripts) ? match.scripts : []) {
      if (!script) {
        continue
      }
      const { children, ...attrs } = script
      routeScripts.push({
        tag: 'script',
        attrs: { ...attrs, ...routeScriptAttrs, nonce },
        children,
      })
    }
  }
  if (manifest) {
    for (const match of assetMatches) {
      for (const asset of manifest.routes[match.routeId]?.scripts ?? []) {
        manifestScripts.push({
          tag: 'script',
          attrs: { ...asset.attrs, nonce },
          children: asset.children,
        })
      }
    }
  }
  return [routeScripts, manifestScripts]
}
export function composeSsrBodyScripts(
  [routeScripts, manifestScripts]: SsrBodyScriptParts,
  initialHydrationScripts?: InitialHydrationScriptTags,
): Array<RouterManagedTag> {
  if (!initialHydrationScripts) {
    return [...routeScripts, ...manifestScripts]
  }
  return [
    ...initialHydrationScripts.before,
    ...routeScripts,
    ...manifestScripts,
    initialHydrationScripts.boundary,
  ]
}
