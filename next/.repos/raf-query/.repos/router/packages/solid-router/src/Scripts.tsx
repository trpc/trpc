import * as Solid from 'solid-js'
import {
  composeSsrBodyScripts,
  getSsrBodyScriptParts,
  replaceEqualDeep,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'

/**
 * During streaming SSR, `<Scripts>` marks where late hydration scripts may
 * begin to be inserted.
 */
export const Scripts = () => {
  const router = useRouter()
  const nonce = router.options.ssr?.nonce

  const scripts = Solid.createMemo(
    (previous: Array<RouterManagedTag> | undefined) => {
      const next = composeSsrBodyScripts(
        getSsrBodyScriptParts(
          router.stores.matches.get(),
          router.ssr?.manifest,
          nonce,
        ),
      )
      return previous ? replaceEqualDeep(previous, next) : next
    },
  )
  const initialHydrationScripts =
    (isServer ?? router.isServer) && router.serverSsr
      ? router.serverSsr.takeInitialHydrationScriptTags()
      : undefined
  const tags = () =>
    initialHydrationScripts
      ? composeSsrBodyScripts([scripts(), []], initialHydrationScripts)
      : scripts()
  return (
    <>
      <Solid.For each={tags()}>{(asset) => <Asset {...asset} />}</Solid.For>
    </>
  )
}
