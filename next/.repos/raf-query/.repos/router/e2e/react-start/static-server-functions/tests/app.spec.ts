import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test.describe('Static Server Functions with Nitro', () => {
  test.describe('Build Output Verification', () => {
    test('should write staticServerFnCache files to the public output directory', () => {
      const publicDir = join(process.cwd(), '.output', 'public')

      // The static server function cache should be in the public directory
      // (the directory served by Nitro), NOT in .output/dist/client/
      const cacheDir = join(publicDir, '__tsr', 'staticServerFnCache')
      expect(existsSync(cacheDir)).toBe(true)

      // There should be JSON cache files
      const files = readdirSync(cacheDir)
      const jsonFiles = files.filter((f) => f.endsWith('.json'))
      expect(jsonFiles.length).toBeGreaterThan(0)
    })

    test('should NOT have staticServerFnCache in dist/client', () => {
      // The bug: cache files end up in .output/dist/client/ instead of .output/public/
      const wrongDir = join(
        process.cwd(),
        '.output',
        'dist',
        'client',
        '__tsr',
        'staticServerFnCache',
      )
      expect(existsSync(wrongDir)).toBe(false)
    })

    test('should have prerendered HTML pages in public directory', () => {
      const publicDir = join(process.cwd(), '.output', 'public')
      expect(existsSync(join(publicDir, 'index.html'))).toBe(true)
      expect(existsSync(join(publicDir, 'posts', 'index.html'))).toBe(true)
    })
  })

  test.describe('Runtime Verification', () => {
    test('should render the home page with data from static server function', async ({
      page,
    }) => {
      await page.goto('/')
      await expect(page.getByTestId('index-heading')).toHaveText('Home')
      await expect(page.getByTestId('index-message')).toHaveText(
        'Hello from static server function!',
      )
    })

    test('should render the posts page with data from static server function', async ({
      page,
    }) => {
      await page.goto('/posts')
      await expect(page.getByTestId('posts-heading')).toHaveText('Posts')
      await expect(page.getByTestId('post-1')).toHaveText('First Post')
      await expect(page.getByTestId('post-2')).toHaveText('Second Post')
      await expect(page.getByTestId('post-3')).toHaveText('Third Post')
    })

    test('should decode a cached RawStream during client navigation', async ({
      page,
    }) => {
      await page.goto('/')
      // Nitro snapshots public assets before Start prerenders (see #6787).
      // Serve the generated file as a static host would to isolate decoding.
      await page.route('**/__tsr/staticServerFnCache/*.json', (route) =>
        route.fulfill({
          path: join(
            process.cwd(),
            '.output',
            'public',
            new URL(route.request().url()).pathname,
          ),
        }),
      )
      const cacheResponse = page.waitForResponse((response) =>
        response.url().includes('/__tsr/staticServerFnCache/'),
      )
      await page.getByTestId('link-raw-stream').click()
      const response = await cacheResponse
      expect(response.status(), response.url()).toBe(200)
      await expect(page.getByTestId('raw-stream')).toHaveText(
        'Static cache stream',
      )
    })
  })
})
