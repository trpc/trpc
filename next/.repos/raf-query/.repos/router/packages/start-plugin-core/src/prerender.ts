import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'pathe'
import { joinURL, withBase, withTrailingSlash, withoutBase } from 'ufo'
import { createLogger } from './utils'
import { Queue } from './queue'
import type { Page, TanStackStartOutputConfig } from './schema'

const DEFAULT_RETRY_DELAY = 500

export interface PrerenderHandler {
  getClientOutputDirectory: () => string
  getOrigin?: () => string
  request: (path: string, options?: RequestInit) => Promise<Response>
  close?: () => Promise<void>
}

export async function prerender({
  startConfig,
  handler,
}: {
  startConfig: TanStackStartOutputConfig
  handler: PrerenderHandler
}) {
  const logger = createLogger('prerender')
  logger.info('Prerendering pages...')

  if (startConfig.prerender?.enabled) {
    let pages = startConfig.pages.length ? startConfig.pages : [{ path: '/' }]

    if (startConfig.prerender.autoStaticPathsDiscovery ?? true) {
      const pagesMap = new Map(pages.map((item) => [item.path, item]))
      const discoveredPages = globalThis.TSS_PRERENDABLE_PATHS || []

      for (const page of discoveredPages) {
        if (!pagesMap.has(page.path)) {
          pagesMap.set(page.path, page)
        }
      }

      pages = Array.from(pagesMap.values())
    }

    startConfig.pages = pages
  }

  const routerBasePath = joinURL('/', startConfig.router.basepath ?? '')
  const routerBaseUrl = new URL(
    routerBasePath,
    handler.getOrigin?.() ?? 'http://localhost',
  )

  startConfig.pages = validateAndNormalizePrerenderPages(
    startConfig.pages,
    routerBaseUrl,
  )

  try {
    const pages = await prerenderPages({
      outputDir: handler.getClientOutputDirectory(),
    })

    logger.info(`Prerendered ${pages.length} pages:`)
    pages.forEach((page) => {
      logger.info(`- ${page}`)
    })
  } catch (error) {
    logger.error(error)
    throw error
  } finally {
    await handler.close?.()
  }

  function extractLinks(html: string): Array<string> {
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/g
    const links: Array<string> = []
    let match: RegExpExecArray | null

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1]
      if (href && (href.startsWith('/') || href.startsWith('./'))) {
        links.push(href)
      }
    }

    return links
  }

  async function prerenderPages({ outputDir }: { outputDir: string }) {
    const seen = new Set<string>()
    const prerendered = new Set<string>()
    const retriesByPath = new Map<string, number>()
    const concurrency = startConfig.prerender?.concurrency ?? os.cpus().length
    logger.info(`Concurrency: ${concurrency}`)
    const queue = new Queue({ concurrency })

    startConfig.pages = validateAndNormalizePrerenderPages(
      startConfig.pages,
      routerBaseUrl,
    )

    startConfig.pages.forEach((page) => addCrawlPageTask(page))

    if (queue.isSettled()) {
      logger.info('No pages matched prerender filter; skipping.')
      return Array.from(prerendered)
    }

    await queue.start()

    return Array.from(prerendered)

    function addCrawlPageTask(page: Page) {
      if (seen.has(page.path)) return

      seen.add(page.path)

      if (page.fromCrawl) {
        startConfig.pages.push(page)
      }

      if (!(page.prerender?.enabled ?? true)) return

      if (
        startConfig.prerender?.filter &&
        !startConfig.prerender.filter(page)
      ) {
        return
      }

      const prerenderOptions = {
        ...startConfig.prerender,
        ...page.prerender,
      }

      queue.add(async () => {
        logger.info(`Crawling: ${page.path}`)
        const retries = retriesByPath.get(page.path) || 0

        try {
          const res = await requestWithRedirects(
            withTrailingSlash(withBase(page.path, routerBasePath)),
            {
              headers: {
                ...(prerenderOptions.headers ?? {}),
              },
            },
            prerenderOptions.maxRedirects,
          )

          if (!res.ok) {
            if (isRedirectResponse(res)) {
              logger.warn(`Max redirects reached for ${page.path}`)
            }

            throw new Error(`Failed to fetch ${page.path}: ${res.statusText}`, {
              cause: res,
            })
          }

          const cleanPagePath = (
            prerenderOptions.outputPath || page.path
          ).split(/[?#]/)[0]!

          const contentType = res.headers.get('content-type') || ''
          const isImplicitHTML =
            !cleanPagePath.endsWith('.html') && contentType.includes('html')

          const routeWithIndex = cleanPagePath.endsWith('/')
            ? cleanPagePath + 'index'
            : cleanPagePath

          const isSpaShell =
            startConfig.spa?.prerender.outputPath === cleanPagePath

          let htmlPath: string
          if (isSpaShell) {
            htmlPath = cleanPagePath + '.html'
          } else if (
            cleanPagePath.endsWith('/') ||
            (prerenderOptions.autoSubfolderIndex ?? true)
          ) {
            htmlPath = joinURL(cleanPagePath, 'index.html')
          } else {
            htmlPath = cleanPagePath + '.html'
          }

          const filename = withoutBase(
            isImplicitHTML ? htmlPath : routeWithIndex,
            routerBasePath,
          )

          const html = await res.text()
          const resolvedOutputDir = path.resolve(outputDir)
          const filepath = path.resolve(outputDir, filename.replace(/^\/+/, ''))
          const outputPrefix = resolvedOutputDir.endsWith(path.sep)
            ? resolvedOutputDir
            : resolvedOutputDir + path.sep
          if (
            filepath !== resolvedOutputDir &&
            !filepath.startsWith(outputPrefix)
          ) {
            throw new Error(
              `Prerender output path must stay within the client output directory: ${filename}`,
            )
          }

          await fsp.mkdir(path.dirname(filepath), {
            recursive: true,
          })

          await fsp.writeFile(filepath, html)

          prerendered.add(page.path)

          const newPage = await prerenderOptions.onSuccess?.({ page, html })

          if (newPage) {
            Object.assign(page, newPage)
          }

          if (prerenderOptions.crawlLinks ?? true) {
            const links = extractLinks(html)
            for (const link of links) {
              addCrawlPageTask({ path: link, fromCrawl: true })
            }
          }
        } catch (error) {
          if (retries < (prerenderOptions.retryCount ?? 0)) {
            const retryDelay = normalizeRetryDelay(prerenderOptions.retryDelay)
            logger.warn(
              `Encountered error, retrying: ${page.path} in ${retryDelay}ms`,
            )
            await new Promise((resolve) => setTimeout(resolve, retryDelay))
            retriesByPath.set(page.path, retries + 1)
            addCrawlPageTask(page)
          } else if (prerenderOptions.failOnError ?? true) {
            throw error
          }
        }
      })
    }
  }

  function normalizeRetryDelay(value: number | undefined): number {
    const retryDelay = Number(value)

    if (!Number.isFinite(retryDelay) || retryDelay < 0) {
      return DEFAULT_RETRY_DELAY
    }

    return Math.trunc(retryDelay)
  }

  async function requestWithRedirects(
    requestPath: string,
    options?: RequestInit,
    maxRedirects: number = 5,
    currentUrl = resolveInternalUrl(requestPath, routerBaseUrl, routerBaseUrl),
  ): Promise<Response> {
    const path = currentUrl && toPreviewPath(currentUrl, routerBaseUrl)
    if (!path) {
      throw new Error(`Prerender request path must be relative: ${requestPath}`)
    }

    const response = await handler.request(path, {
      ...options,
      redirect: 'manual',
    })

    if (isRedirectResponse(response) && maxRedirects > 0) {
      const location = response.headers.get('location')!.trim()
      const url = resolveInternalUrl(location, currentUrl, routerBaseUrl)
      const redirectPath = url && toPreviewPath(url, routerBaseUrl)

      if (url && redirectPath) {
        return requestWithRedirects(
          redirectPath,
          options,
          maxRedirects - 1,
          url,
        )
      }

      logger.warn(`Skipping redirect outside the preview basepath: ${location}`)
    }

    return response
  }
}

function isRedirectResponse(res: Response) {
  return (
    [301, 302, 303, 307, 308].includes(res.status) &&
    !!res.headers.get('location')?.trim()
  )
}

function resolveInternalUrl(
  href: string,
  baseUrl: URL,
  allowedOrigin: URL,
): URL | undefined {
  try {
    const url = new URL(href, baseUrl)
    if (
      url.protocol !== allowedOrigin.protocol ||
      url.origin !== allowedOrigin.origin ||
      url.username ||
      url.password
    ) {
      return undefined
    }
    return url
  } catch {
    return undefined
  }
}

function toPreviewPath(url: URL, routerBaseUrl: URL): string | undefined {
  const basepath = routerBaseUrl.pathname.replace(/\/$/, '')
  if (
    basepath &&
    url.pathname !== basepath &&
    !url.pathname.startsWith(basepath + '/')
  ) {
    return undefined
  }
  if (url.pathname.startsWith('//')) {
    return url.href
  }
  return url.pathname + url.search
}

export function validateAndNormalizePrerenderPages(
  pages: Array<Page>,
  routerBaseUrl: URL,
): Array<Page> {
  return pages.map((page) => {
    let url: URL
    try {
      url = new URL(page.path, routerBaseUrl)
    } catch (err) {
      throw new Error(`prerender page path must be relative: ${page.path}`, {
        cause: err,
      })
    }

    if (
      url.protocol !== routerBaseUrl.protocol ||
      url.origin !== routerBaseUrl.origin ||
      url.username ||
      url.password
    ) {
      throw new Error(`prerender page path must be relative: ${page.path}`)
    }

    const decodedPathname = decodeURIComponent(url.pathname)
    const normalizedPath = decodedPathname + url.search + url.hash
    const normalizedUrl = resolveInternalUrl(
      normalizedPath,
      routerBaseUrl,
      routerBaseUrl,
    )
    if (!normalizedUrl) {
      throw new Error(`prerender page path must be relative: ${page.path}`)
    }

    return {
      ...page,
      path: normalizedPath,
    }
  })
}
