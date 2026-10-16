import * as React from 'react'
import { useSelector } from '@tanstack/react-store'
import {
  _getAssetMatches,
  appendUniqueUserTags,
  deepEqual,
  escapeHtml,
  getAssetCrossOrigin,
  getScriptPreloadAttrs,
  resolveManifestCssLink,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
import type {
  AnyRouteMatch,
  AssetCrossOriginConfig,
  RouterManagedTag,
} from '@tanstack/router-core'

function buildTagsFromMatches(
  router: ReturnType<typeof useRouter>,
  nonce: string | undefined,
  matches: Array<AnyRouteMatch>,
  assetCrossOrigin?: AssetCrossOriginConfig,
): Array<RouterManagedTag> {
  matches = _getAssetMatches(matches)
  const routeMeta = matches
    .map((match) => match.meta)
    .filter((meta) => meta !== undefined)

  const resultMeta: Array<RouterManagedTag> = []
  const metaByAttribute: Record<string, true> = {}
  let title: RouterManagedTag | undefined
  for (let i = routeMeta.length - 1; i >= 0; i--) {
    const metas = routeMeta[i]!
    for (let j = metas.length - 1; j >= 0; j--) {
      const m = metas[j]
      if (!m) continue

      if (m.title) {
        if (!title) {
          title = {
            tag: 'title',
            children: m.title,
          }
        }
      } else if ('script:ld+json' in m) {
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

  if (nonce) {
    resultMeta.push({
      tag: 'meta',
      attrs: {
        property: 'csp-nonce',
        content: nonce,
      },
    })
  }
  resultMeta.reverse()

  const constructedLinks = matches
    .flatMap((match) => match.links ?? [])
    .filter((link) => link !== undefined)
    .map((link) => ({
      tag: 'link',
      attrs: {
        ...link,
        nonce,
      },
    })) satisfies Array<RouterManagedTag>

  const manifest = router.ssr?.manifest
  const manifestCssTags: Array<RouterManagedTag> = []
  if (manifest) {
    matches.forEach((match) => {
      const css = manifest.routes[match.routeId]?.css
      css?.forEach((link) => {
        const resolvedLink = resolveManifestCssLink(link)
        manifestCssTags.push({
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            ...resolvedLink,
            crossOrigin:
              getAssetCrossOrigin(assetCrossOrigin, 'stylesheet') ??
              resolvedLink.crossOrigin,
            suppressHydrationWarning: true,
            nonce,
          },
        })
      })
    })

    if (manifest.inlineStyle) {
      manifestCssTags.push({
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

  const preloadLinks: Array<RouterManagedTag> = []
  if (manifest) {
    matches.forEach((match) => {
      manifest.routes[match.routeId]?.preloads?.forEach((preload) => {
        preloadLinks.push({
          tag: 'link',
          attrs: {
            ...getScriptPreloadAttrs(manifest, preload, assetCrossOrigin),
            nonce,
          },
        })
      })
    })
  }

  const styles = matches
    .flatMap((match) => match.styles ?? [])
    .filter((style) => style !== undefined)
    .map(({ children, ...attrs }) => ({
      tag: 'style',
      attrs: {
        ...attrs,
        nonce,
      },
      children: children as string | undefined,
    })) satisfies Array<RouterManagedTag>

  const headScripts = matches
    .flatMap((match) => match.headScripts ?? [])
    .filter((script) => script !== undefined)
    .map(({ children, ...script }) => ({
      tag: 'script',
      attrs: {
        ...script,
        nonce,
      },
      children: children as string | undefined,
    })) satisfies Array<RouterManagedTag>

  const tags: Array<RouterManagedTag> = []
  appendUniqueUserTags(tags, resultMeta)
  tags.push(...preloadLinks)
  appendUniqueUserTags(tags, constructedLinks)
  tags.push(...manifestCssTags)
  appendUniqueUserTags(tags, styles)
  appendUniqueUserTags(tags, headScripts)
  return tags
}

/**
 * Build the head/link/meta/script tags from the renderable presented prefix.
 * Used internally by `HeadContent`.
 */
export const useTags = (assetCrossOrigin?: AssetCrossOriginConfig) => {
  const router = useRouter()
  const nonce = router.options.ssr?.nonce

  if (isServer ?? router.isServer) {
    return buildTagsFromMatches(
      router,
      nonce,
      router.stores.matches.get(),
      assetCrossOrigin,
    )
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
  const selectTags = React.useCallback(
    (matches: Array<AnyRouteMatch>) =>
      buildTagsFromMatches(router, nonce, matches, assetCrossOrigin),
    [assetCrossOrigin, nonce, router],
  )
  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
  return useSelector(router.stores.matches, selectTags, { compare: deepEqual })
}
