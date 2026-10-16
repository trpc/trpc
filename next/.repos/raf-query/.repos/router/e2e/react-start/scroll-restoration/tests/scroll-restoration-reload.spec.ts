import { writeFile } from 'node:fs/promises'
import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

// A frame recorder is diagnostic evidence, not proof of compositor-frame pixels.
for (const holdBootstrap of [false, true]) {
  test(`reload keeps rendered SSR scroll stable (bootstrap held=${holdBootstrap})`, async ({
    page,
  }, testInfo) => {
    const errors: Array<string> = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(() => {
      const holdKey = 'test-hold-scroll-bootstrap'
      ;(window as any).__holdScrollBootstrap =
        sessionStorage.getItem(holdKey) === 'true'
      sessionStorage.removeItem(holdKey)
      const samples: Array<{
        time: number
        phase: string
        x: number
        y: number
        mode: ScrollRestoration
        scrollHeight: number
        viewportHeight: number
        anchorTop: number | null
        visibility: DocumentVisibilityState
      }> = []
      let phase = 'initial'
      let frame = 0
      const sample = () => {
        samples.push({
          time: performance.now(),
          phase,
          x: scrollX,
          y: scrollY,
          mode: history.scrollRestoration,
          scrollHeight: document.documentElement?.scrollHeight ?? 0,
          viewportHeight: innerHeight,
          anchorTop:
            document
              .querySelector('[data-testid="reset-scroll-false-link-6"]')
              ?.getBoundingClientRect().top ?? null,
          visibility: document.visibilityState,
        })
      }
      const mark = (next: string) => {
        phase = next
        sample()
      }
      const tick = () => {
        sample()
        if (samples.length < 600) {
          frame = requestAnimationFrame(tick)
        }
      }
      sample()
      frame = requestAnimationFrame(tick)
      for (const event of [
        'DOMContentLoaded',
        'load',
        'pageshow',
        'test-scroll-hydrated',
        'test-scroll-bootstrap-release',
      ]) {
        addEventListener(event, () => mark(event))
      }
      ;(window as any).__scrollProbe = {
        samples,
        stop: () => {
          cancelAnimationFrame(frame)
          return {
            samples,
            paints: performance
              .getEntriesByType('paint')
              .map(({ name, startTime }) => ({ name, startTime })),
          }
        },
      }
    })
    await page.goto('/')
    await page.getByRole('link', { name: '/reset-scroll-false-a' }).click()
    await page.waitForLoadState('networkidle')
    const before = await page.evaluate(async (holdBootstrap) => {
      scrollTo(0, 500)
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
      sessionStorage.setItem(
        'test-hold-scroll-bootstrap',
        String(holdBootstrap),
      )
      return {
        y: scrollY,
        anchorTop: document
          .querySelector('[data-testid="reset-scroll-false-link-6"]')!
          .getBoundingClientRect().top,
      }
    }, holdBootstrap)
    expect(before.y).toBeGreaterThan(0)
    await page.reload()
    // This window starts at document readiness, independently of scroll correctness.
    await page.evaluate(async () => {
      await Promise.all(
        Array.from(
          document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
          (link) => {
            if (link.sheet) {
              return
            }
            return new Promise<void>((resolve) =>
              link.addEventListener('load', () => resolve(), { once: true }),
            )
          },
        ),
      )
      for (let i = 0; i < 4; i++) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        )
      }
    })
    if (holdBootstrap) {
      expect(
        await page.evaluate(
          () => typeof (window as any).__releaseScrollBootstrap,
        ),
      ).toBe('function')
      expect(
        await page.evaluate(() =>
          (window as any).__scrollProbe.samples.some(
            (sample: any) => sample.phase === 'test-scroll-hydrated',
          ),
        ),
      ).toBe(false)
    }
    const screenshotPath = testInfo.outputPath('SSR-viewport.png')
    await page.screenshot({ path: screenshotPath })
    await testInfo.attach('SSR-viewport', {
      path: screenshotPath,
      contentType: 'image/png',
    })
    const held = await page.evaluate(() => ({
      y: scrollY,
      anchorTop: document
        .querySelector('[data-testid="reset-scroll-false-link-6"]')!
        .getBoundingClientRect().top,
    }))
    if (holdBootstrap) {
      await page.evaluate(() => {
        dispatchEvent(new Event('test-scroll-bootstrap-release'))
        ;(window as any).__releaseScrollBootstrap()
      })
    }
    await expect
      .poll(() => page.evaluate(() => history.scrollRestoration))
      .toBe('manual')
    await page.waitForLoadState('networkidle')
    await page.evaluate(async () => {
      for (let i = 0; i < 8; i++) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        )
      }
    })
    const timeline = await page.evaluate(() =>
      (window as any).__scrollProbe.stop(),
    )
    const timelinePath = testInfo.outputPath('scroll-timeline.json')
    await writeFile(
      timelinePath,
      JSON.stringify({ before, held, ...timeline, errors }, null, 2),
    )
    await testInfo.attach('scroll-timeline', {
      path: timelinePath,
      contentType: 'application/json',
    })
    expect(held.y).toBe(before.y)
    expect(held.anchorTop).toBeCloseTo(before.anchorTop, 0)
    const renderedSamples = timeline.samples.filter(
      (sample: any) => sample.phase !== 'initial' && sample.anchorTop !== null,
    )
    expect(renderedSamples.length).toBeGreaterThan(0)
    for (const sample of renderedSamples) {
      expect(Math.abs(sample.y - before.y)).toBeLessThanOrEqual(1)
      expect(Math.abs(sample.anchorTop - before.anchorTop)).toBeLessThanOrEqual(
        1,
      )
    }
    expect(errors).toEqual([])
  })
}
