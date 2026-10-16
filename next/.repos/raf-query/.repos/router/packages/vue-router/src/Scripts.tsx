import * as Vue from 'vue'
import {
  composeSsrBodyScripts,
  getSsrBodyScriptParts,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useSelector } from '@tanstack/vue-store'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'

/**
 * During streaming SSR, `<Scripts>` marks where late hydration scripts may
 * begin to be inserted.
 */
export const Scripts = Vue.defineComponent({
  name: 'Scripts',
  setup() {
    const router = useRouter()
    const nonce = router.options.ssr?.nonce
    const matches = useSelector(router.stores.matches, (value) => value)

    const scripts = Vue.computed(() =>
      getSsrBodyScriptParts(matches.value, router.ssr?.manifest, nonce),
    )

    const mounted = Vue.ref(false)
    Vue.onMounted(() => {
      mounted.value = true
    })

    return () => {
      return renderScripts(router, scripts.value, mounted.value, nonce)
    }
  },
})

function renderScripts(
  router: ReturnType<typeof useRouter>,
  scriptParts: ReturnType<typeof getSsrBodyScriptParts>,
  mounted: boolean,
  nonce?: string,
) {
  const allScripts: Array<RouterManagedTag> = []
  let streamBoundary: RouterManagedTag | undefined
  const [scripts, assetScripts] = scriptParts

  if ((isServer ?? router.isServer) && router.serverSsr) {
    const initialHydrationScripts =
      router.serverSsr.takeInitialHydrationScriptTags()
    allScripts.push(
      ...composeSsrBodyScripts(scriptParts, initialHydrationScripts),
    )
    return renderScriptTags(allScripts)
  } else if (router.ssr && !mounted) {
    allScripts.push({
      tag: 'script',
      attrs: { nonce, 'data-allow-mismatch': true },
      children: '',
    } satisfies RouterManagedTag)

    streamBoundary = {
      tag: 'script',
      attrs: {
        nonce,
        'data-allow-mismatch': true,
      },
      children: '',
    } satisfies RouterManagedTag

    for (const asset of assetScripts) {
      allScripts.push({
        tag: 'script',
        attrs: {
          ...asset.attrs,
          'data-allow-mismatch': true,
        },
        children: '',
      } satisfies RouterManagedTag)
    }
  }

  allScripts.push(...scripts)

  if (mounted) {
    allScripts.push(...assetScripts)
  }

  if (streamBoundary) {
    allScripts.push(streamBoundary)
  }

  return renderScriptTags(allScripts)
}

function renderScriptTags(allScripts: Array<RouterManagedTag>) {
  return (
    <>
      {allScripts.map((asset, i) => (
        <Asset {...asset} key={`tsr-scripts-${asset.tag}-${i}`} />
      ))}
    </>
  )
}
