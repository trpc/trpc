import { useSelector } from '@tanstack/react-store'
import {
  composeSsrBodyScripts,
  deepEqual,
  getSsrBodyScriptParts,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'

type ScriptRenderAsset = RouterManagedTag & {
  preventScriptHoist?: boolean
}

const routeScriptAttrs = { suppressHydrationWarning: true }

/**
 * Render body script tags collected from route matches and SSR manifests.
 * During streaming SSR, `<Scripts>` marks where late hydration scripts may
 * begin to be inserted.
 */
export const Scripts = () => {
  const router = useRouter()
  const nonce = router.options.ssr?.nonce

  const getParts = (matches: Array<any>) => {
    const parts = getSsrBodyScriptParts(
      matches,
      router.ssr?.manifest,
      nonce,
      routeScriptAttrs,
    )
    for (const script of parts[1]) {
      if (typeof script.attrs?.src === 'string') {
        const scriptWithHoist = script as ScriptRenderAsset
        scriptWithHoist.preventScriptHoist = true
      }
    }
    return parts
  }

  const getScripts = (matches: Array<any>) => {
    return composeSsrBodyScripts(getParts(matches))
  }

  if (isServer ?? router.isServer) {
    const activeMatches = router.stores.matches.get()
    return renderScripts(
      composeSsrBodyScripts(
        getParts(activeMatches),
        router.serverSsr?.takeInitialHydrationScriptTags(),
      ),
    )
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
  const scripts = useSelector(router.stores.matches, getScripts, {
    compare: deepEqual,
  })

  return renderScripts(scripts)
}

function renderScripts(scripts: Array<ScriptRenderAsset>) {
  return (
    <>
      {scripts.map((asset, i) => (
        <Asset {...asset} key={`tsr-scripts-${asset.tag}-${i}`} />
      ))}
    </>
  )
}
