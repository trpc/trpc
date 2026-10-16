import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { postBuild } from '../src/post-build'
import { parseStartConfig } from '../src/schema'

describe('post-build sitemap', () => {
  it('writes sitemap files before resolving, using pages discovered during prerendering', async () => {
    const publicDir = await mkdtemp(path.join(tmpdir(), 'tss-sitemap-'))
    const startConfig = parseStartConfig(
      {
        sitemap: { host: 'https://example.com', outputPath: 'custom.xml' },
        prerender: { enabled: true },
        pages: [
          { path: '/hidden', sitemap: { exclude: true } },
          {
            path: '/posts?sort=a&tag=b',
            sitemap: {
              lastmod: '2026-01-02',
              priority: 0,
              changefreq: 'daily',
            },
          },
        ],
      },
      { framework: 'react' },
      process.cwd(),
    )

    try {
      await postBuild({
        startConfig,
        adapter: {
          getClientOutputDirectory: () => publicDir,
          async prerender(config) {
            await Promise.resolve()
            config.pages.push({ path: '/discovered' })
          },
        },
      })

      const xml = await readFile(path.join(publicDir, 'custom.xml'), 'utf8')
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
      expect(xml).toContain('https://example.com/posts?sort=a&amp;tag=b')
      expect(xml).toContain('<lastmod>2026-01-02</lastmod>')
      expect(xml).toContain('<priority>0</priority>')
      expect(xml).toContain('<changefreq>daily</changefreq>')
      expect(xml).toContain('<loc>https://example.com/discovered</loc>')
      expect(xml).not.toContain('/hidden')
      const pages = JSON.parse(
        await readFile(path.join(publicDir, 'pages.json'), 'utf8'),
      )
      expect(pages).toEqual({
        pages: startConfig.pages,
        host: 'https://example.com',
        lastBuilt: expect.any(String),
      })
    } finally {
      await rm(publicDir, { recursive: true, force: true })
    }
  })

  it('propagates sitemap validation errors through the post-build promise', async () => {
    await expect(
      postBuild({
        startConfig: parseStartConfig(
          { sitemap: { enabled: true } },
          { framework: 'react' },
          process.cwd(),
        ),
        adapter: {
          getClientOutputDirectory: () => '/unused',
          prerender: vi.fn(),
        },
      }),
    ).rejects.toThrow(
      'Sitemap host is not set and required to build the sitemap.',
    )
  })
})
