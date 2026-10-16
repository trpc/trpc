import * as Solid from 'solid-js'
import {
  _getAssetMatches,
  appendUniqueUserTags,
  escapeHtml,
  getAssetCrossOrigin,
  getScriptPreloadAttrs,
  resolveManifestCssLink,
} from '@tanstack/router-core'
import { useRouter } from './useRouter'
import type {
  AssetCrossOriginConfig,
  RouterManagedTag,
} from '@tanstack/router-core'

/**
 * Build the head/link/meta/script tags from the renderable presented prefix.
 * Used internally by `HeadContent`.
 */
export const useTags = (assetCrossOrigin?: AssetCrossOriginConfig) => {
  const router = useRouter()
  const nonce = router.options.ssr?.nonce
  return Solid.createMemo((prev: Array<RouterManagedTag> | undefined) => {
    const matches = _getAssetMatches(router.stores.matches.get())
    const resultMeta: Array<RouterManagedTag> = []
    const metaByAttribute: Record<string, true> = {}
    let title: RouterManagedTag | undefined
    for (let i = matches.length - 1; i >= 0; i--) {
      const metas = matches[i]!.meta
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
          // Handle JSON-LD structured data
          // Content is HTML-escaped to prevent XSS when injected via innerHTML
          try {
            const json = JSON.stringify(m['script:ld+json'])
            resultMeta.push({
              tag: 'script',
              attrs: {
                type: 'application/ld+json',
              },
              children: escapeHtml(json),
            })
          } catch {
            // Skip invalid JSON-LD objects
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
              nonce,
            },
          })
        }
      }
    }

    if (title) {
      resultMeta.push(title)
    }

    if (router.options.ssr?.nonce) {
      resultMeta.push({
        tag: 'meta',
        attrs: {
          property: 'csp-nonce',
          content: router.options.ssr.nonce,
        },
      })
    }
    resultMeta.reverse()

    const next: Array<RouterManagedTag> = []
    appendUniqueUserTags(next, resultMeta)
    const manifest = router.ssr?.manifest
    const preloads: Array<RouterManagedTag> = []
    for (const match of matches) {
      for (const preload of manifest?.routes[match.routeId]?.preloads ?? []) {
        if (!preload) {
          continue
        }
        preloads.push({
          tag: 'link',
          attrs: {
            ...getScriptPreloadAttrs(manifest, preload, assetCrossOrigin),
            nonce,
          },
        })
      }
    }
    next.push(...preloads)

    const links: Array<RouterManagedTag> = []
    for (const match of matches) {
      for (const link of match.links ?? []) {
        if (link === undefined) {
          continue
        }
        links.push({ tag: 'link', attrs: { ...link, nonce } })
      }
    }
    appendUniqueUserTags(next, links)

    if (manifest) {
      for (const match of matches) {
        for (const link of manifest.routes[match.routeId]?.css ?? []) {
          const resolvedLink = resolveManifestCssLink(link)
          next.push({
            tag: 'link',
            attrs: {
              rel: 'stylesheet',
              ...resolvedLink,
              crossOrigin:
                getAssetCrossOrigin(assetCrossOrigin, 'stylesheet') ??
                resolvedLink.crossOrigin,
              nonce,
            },
          })
        }
      }
      if (manifest.inlineStyle) {
        next.push({
          tag: 'style',
          attrs: {
            ...manifest.inlineStyle.attrs,
            nonce,
          },
          children: manifest.inlineStyle.children,
          inlineCss: true,
        })
      }
    }

    const styles: Array<RouterManagedTag> = []
    const headScripts: Array<RouterManagedTag> = []
    for (const match of matches) {
      for (const style of match.styles ?? []) {
        if (style === undefined) {
          continue
        }
        const { children, ...attrs } = style
        styles.push({
          tag: 'style',
          attrs: { ...attrs, nonce },
          children: children as string | undefined,
        })
      }
      for (const script of match.headScripts ?? []) {
        if (script === undefined) {
          continue
        }
        const { children, ...attrs } = script
        headScripts.push({
          tag: 'script',
          attrs: {
            ...attrs,
            nonce,
          },
          children: children as string | undefined,
        })
      }
    }
    appendUniqueUserTags(next, styles)
    appendUniqueUserTags(next, headScripts)

    if (prev === undefined) {
      return next
    }
    return replaceEqualTags(prev, next)
  })
}

function replaceEqualTags(
  prev: Array<RouterManagedTag>,
  next: Array<RouterManagedTag>,
) {
  const prevByKey = new Map<string, RouterManagedTag>()
  for (const tag of prev) {
    prevByKey.set(JSON.stringify(tag), tag)
  }

  let isEqual = prev.length === next.length
  const result = next.map((tag, index) => {
    const existing = prevByKey.get(JSON.stringify(tag))
    if (existing) {
      if (existing !== prev[index]) {
        isEqual = false
      }
      return existing
    }

    isEqual = false
    return tag
  })

  return isEqual ? prev : result
}
