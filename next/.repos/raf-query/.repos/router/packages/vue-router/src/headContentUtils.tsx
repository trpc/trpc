import * as Vue from 'vue'
import {
  _getAssetMatches,
  appendUniqueUserTags,
  escapeHtml,
  getAssetCrossOrigin,
  getScriptPreloadAttrs,
  resolveManifestCssLink,
} from '@tanstack/router-core'
import { useSelector } from '@tanstack/vue-store'
import { useRouter } from './useRouter'
import type {
  AssetCrossOriginConfig,
  RouterManagedTag,
} from '@tanstack/router-core'

export const useTags = (assetCrossOrigin?: AssetCrossOriginConfig) => {
  const router = useRouter()
  const matches = useSelector(router.stores.matches, _getAssetMatches)

  const tags = Vue.computed<Array<RouterManagedTag>>(() => {
    const currentMatches = matches.value
    const tags: Array<RouterManagedTag> = []
    const manifest = router.ssr?.manifest
    for (const match of currentMatches) {
      for (const link of manifest?.routes[match.routeId]?.css ?? []) {
        const resolvedLink = resolveManifestCssLink(link)
        tags.push({
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            ...resolvedLink,
            crossOrigin:
              getAssetCrossOrigin(assetCrossOrigin, 'stylesheet') ??
              resolvedLink.crossOrigin,
          },
        })
      }
    }
    if (manifest?.inlineStyle) {
      tags.push({
        tag: 'style',
        attrs: manifest.inlineStyle.attrs,
        children: manifest.inlineStyle.children,
        inlineCss: true,
      })
    }

    const resultMeta: Array<RouterManagedTag> = []
    const metaByAttribute: Record<string, true> = {}
    let title: RouterManagedTag | undefined
    for (let i = currentMatches.length - 1; i >= 0; i--) {
      const metas = currentMatches[i]!.meta
      if (!metas) {
        continue
      }
      for (let j = metas.length - 1; j >= 0; j--) {
        const m = metas[j]
        if (!m) {
          continue
        }

        if (m.title) {
          if (!title) {
            title = {
              tag: 'title',
              children: m.title,
            }
          }
        } else if ('script:ld+json' in m) {
          // Content is HTML-escaped to prevent XSS when injected via innerHTML.
          try {
            resultMeta.push({
              tag: 'script',
              attrs: { type: 'application/ld+json' },
              children: escapeHtml(JSON.stringify(m['script:ld+json'])),
            })
          } catch {
            // Skip invalid JSON-LD objects.
          }
        } else {
          const attribute = m.name ?? m.property
          if (attribute) {
            if (metaByAttribute[attribute]) {
              continue
            } else {
              metaByAttribute[attribute] = true
            }
          }
          resultMeta.push({
            tag: 'meta',
            attrs: {
              ...m,
            },
          })
        }
      }
    }

    if (title) {
      resultMeta.push(title)
    }
    resultMeta.reverse()
    appendUniqueUserTags(tags, resultMeta)

    const preloads: Array<RouterManagedTag> = []
    const links: Array<RouterManagedTag> = []
    const headScripts: Array<RouterManagedTag> = []
    for (const match of currentMatches) {
      for (const preload of manifest?.routes[match.routeId]?.preloads ?? []) {
        if (preload) {
          preloads.push({
            tag: 'link',
            attrs: {
              ...getScriptPreloadAttrs(manifest, preload, assetCrossOrigin),
            },
          })
        }
      }
      for (const link of match.links ?? []) {
        if (link) {
          links.push({ tag: 'link', attrs: { ...link } })
        }
      }
      for (const script of match.headScripts ?? []) {
        if (script) {
          const { children, ...attrs } = script
          headScripts.push({
            tag: 'script',
            attrs: { ...attrs },
            children: children as string | undefined,
          })
        }
      }
    }
    tags.push(...preloads)
    appendUniqueUserTags(tags, links)
    appendUniqueUserTags(tags, headScripts)
    return tags
  })
  return () => tags.value
}
