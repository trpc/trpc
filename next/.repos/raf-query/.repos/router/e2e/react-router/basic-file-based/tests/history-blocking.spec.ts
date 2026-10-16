import { expect } from '@playwright/test'
import { apiTest as test } from '@tanstack/router-e2e-utils'
import type { Page } from '@playwright/test'

async function prepareDocumentTraversal(page: Page, delta: number) {
  if (delta < 0) {
    for (let i = 0; i < Math.abs(delta); i++) {
      await page.goto(`/?entry=${i}`)
    }
    await page.goto('/history-blocking')
  } else {
    await page.goto('/history-blocking')
    for (let i = 0; i < delta; i++) {
      await page.goto(`/?entry=${i}`)
    }
    for (let i = 0; i < delta; i++) {
      await page.goBack()
    }
  }
  await expect(
    page.getByRole('heading', { name: 'History blocking' }),
  ).toBeVisible()
  await page.getByLabel('Draft', { exact: true }).fill('Unsaved draft')
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible()
}

async function prepareSameDocumentTraversal(page: Page, delta: number) {
  await page.goto('/history-blocking')
  for (let step = 1; step <= Math.abs(delta); step++) {
    await page.getByRole('link', { name: 'Add history entry' }).click()
    await expect(page.getByText(`Step ${step}`, { exact: true })).toBeVisible()
  }
  if (delta > 0) {
    for (let step = delta - 1; step >= 0; step--) {
      await page
        .getByRole('button', { name: 'History back', exact: true })
        .click()
      await expect(
        page.getByText(`Step ${step}`, { exact: true }),
      ).toBeVisible()
    }
  }
  await page.getByLabel('Draft', { exact: true }).fill('Unsaved draft')
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible()
}

function dismissUnloadDialogs(page: Page) {
  const dialogs: Array<string> = []
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.type())
    await dialog.dismiss()
  })
  return dialogs
}

for (const [direction, delta] of [
  ['back', -1],
  ['forward', 1],
  ['go(-1)', -1],
  ['go(1)', 1],
  ['go(-2)', -2],
  ['go(2)', 2],
] as const) {
  test(`history ${direction} to another document warns before losing edits`, async ({
    page,
  }) => {
    await prepareDocumentTraversal(page, delta)
    const dialogs = dismissUnloadDialogs(page)
    const originalUrl = page.url()

    await page
      .getByRole('button', { name: `History ${direction}`, exact: true })
      .click()

    await expect.poll(() => dialogs).toEqual(['beforeunload'])
    await expect(page).toHaveURL(originalUrl)
    await expect(page.getByLabel('Draft', { exact: true })).toHaveValue(
      'Unsaved draft',
    )
  })

  test(`history ${direction} can explicitly bypass a document unload warning`, async ({
    page,
  }) => {
    await prepareDocumentTraversal(page, delta)
    await page.getByLabel('Ignore blockers').check()
    const dialogs = dismissUnloadDialogs(page)

    await page
      .getByRole('button', { name: `History ${direction}`, exact: true })
      .click()

    await expect(page).toHaveURL(/\/\?entry=\d$/)
    expect(dialogs).toEqual([])
  })

  test(`ignored same-document ${direction} preserves the next document unload warning`, async ({
    page,
  }) => {
    await prepareSameDocumentTraversal(page, delta)
    await page.getByLabel('Ignore blockers').check()
    const dialogs = dismissUnloadDialogs(page)

    await page
      .getByRole('button', { name: `History ${direction}`, exact: true })
      .click()

    await expect(
      page.getByText(`Step ${delta < 0 ? 0 : delta}`, {
        exact: true,
      }),
    ).toBeVisible()
    await expect(page.getByLabel('Draft', { exact: true })).toHaveValue(
      'Unsaved draft',
    )
    await expect(
      page.getByText('Blocker status: idle', { exact: true }),
    ).toBeVisible()
    expect(dialogs).toEqual([])

    await page.getByRole('link', { name: 'Leave document' }).click()

    await expect.poll(() => dialogs).toEqual(['beforeunload'])
    await expect(page.getByLabel('Draft', { exact: true })).toHaveValue(
      'Unsaved draft',
    )
  })

  test(`same-document ${direction} still checks blockers by default`, async ({
    page,
  }) => {
    await prepareSameDocumentTraversal(page, delta)
    const originalUrl = page.url()

    await page
      .getByRole('button', { name: `History ${direction}`, exact: true })
      .click()

    await expect(
      page.getByText('Blocker status: blocked', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(`Step ${delta < 0 ? -delta : 0}`, { exact: true }),
    ).toBeVisible()
    await expect(page.getByLabel('Draft', { exact: true })).toHaveValue(
      'Unsaved draft',
    )
    await page.getByRole('button', { name: 'Stay here' }).click()
    await expect(
      page.getByText('Blocker status: idle', { exact: true }),
    ).toBeVisible()
    await expect(page).toHaveURL(originalUrl)
    await expect(
      page.getByText(`Step ${delta < 0 ? -delta : 0}`, { exact: true }),
    ).toBeVisible()
  })
}

for (const ignoreBlocker of [false, true]) {
  test(`history go(0) ${ignoreBlocker ? 'can bypass' : 'preserves'} the reload warning`, async ({
    page,
  }) => {
    await page.goto('/history-blocking')
    await page.getByLabel('Draft', { exact: true }).fill('Unsaved draft')
    await expect(
      page.getByText('Unsaved changes', { exact: true }),
    ).toBeVisible()
    if (ignoreBlocker) {
      await page.getByLabel('Ignore blockers').check()
    }
    const dialogs = dismissUnloadDialogs(page)

    await page
      .getByRole('button', { name: 'History go(0)', exact: true })
      .click()

    if (ignoreBlocker) {
      await expect(page.getByLabel('Draft', { exact: true })).toHaveValue('')
      expect(dialogs).toEqual([])
    } else {
      await expect.poll(() => dialogs).toEqual(['beforeunload'])
      await expect(page.getByLabel('Draft', { exact: true })).toHaveValue(
        'Unsaved draft',
      )
    }
  })
}

for (const action of ['Navigate document', 'Replace document']) {
  test(`${action}: invalid URLs preserve the next unload warning`, async ({
    page,
  }) => {
    await page.goto('/history-blocking')
    await page.getByLabel('Draft', { exact: true }).fill('Unsaved draft')
    await page.getByLabel('Ignore blockers').check()
    await page.getByLabel('Document destination').fill('https://[')
    const dialogs = dismissUnloadDialogs(page)

    await page.getByRole('button', { name: action, exact: true }).click()

    await expect(page.getByRole('status')).toBeVisible()
    expect(dialogs).toEqual([])
    await page.getByRole('link', { name: 'Leave document' }).click()

    await expect.poll(() => dialogs).toEqual(['beforeunload'])
    await expect(page.getByLabel('Draft', { exact: true })).toHaveValue(
      'Unsaved draft',
    )
  })

  test(`${action}: the current fragment preserves the next unload warning`, async ({
    page,
  }) => {
    await page.goto('/history-blocking?step=0#same')
    await page.getByLabel('Draft', { exact: true }).fill('Unsaved draft')
    await page.getByLabel('Ignore blockers').check()
    await page.getByLabel('Document destination').fill('#same')
    const dialogs = dismissUnloadDialogs(page)

    await page.getByRole('button', { name: action, exact: true }).click()

    await expect(page).toHaveURL('/history-blocking?step=0#same')
    expect(dialogs).toEqual([])
    await page.getByRole('link', { name: 'Leave document' }).click()

    await expect.poll(() => dialogs).toEqual(['beforeunload'])
    await expect(page.getByLabel('Draft', { exact: true })).toHaveValue(
      'Unsaved draft',
    )
  })

  for (const ignoreBlocker of [false, true]) {
    test(`${action}: ${ignoreBlocker ? 'skipped' : 'accepted'} blockers need no native confirmation`, async ({
      page,
    }) => {
      await page.goto('/history-blocking')
      await page.getByLabel('Draft', { exact: true }).fill('Unsaved draft')
      if (ignoreBlocker) {
        await page.getByLabel('Ignore blockers').check()
      }
      const dialogs = dismissUnloadDialogs(page)

      await page.getByRole('button', { name: action, exact: true }).click()
      if (!ignoreBlocker) {
        await page
          .getByRole('button', { name: 'Continue navigation', exact: true })
          .click()
      }

      await expect(page).toHaveURL('/')
      expect(dialogs).toEqual([])
    })
  }
}
