/**
 * Shared definition of the `link-churn` scenario: Links that leave, stay and
 * arrive across navigations. A `/hub` layout renders Links that stay mounted
 * while its leaves change; the `/hub/list` leaf renders Links that depart when
 * leaving it and mount again when returning; `/other` sits outside the layout
 * so leaving the list there unmounts layout and leaf Links together. The
 * existing `links` scenario keeps all its Links in the root layout, so none of
 * them ever departs or remounts. The three framework apps consume these
 * constants so the workload is identical modulo the rendering layer.
 */
import type { ScenarioStep } from '../harness'

// Layout (staying) Links: HUB_ITEM_COUNT ids x 5 variants.
export const HUB_ITEM_COUNT = 6
// List leaf (departing) Links: LIST_ITEM_COUNT ids x 5 variants.
export const LIST_ITEM_COUNT = 20

const ids = (count: number) =>
  Array.from({ length: count }, (_, index) => String(index + 1))

export const hubItemIds = ids(HUB_ITEM_COUNT)
export const listItemIds = ids(LIST_ITEM_COUNT)

export interface HubSearch {
  page?: number
  sort?: 'asc' | 'desc'
}

/** Search validation of the `/hub` layout, inherited by its leaves. */
export function validateHubSearch(search: Record<string, unknown>): HubSearch {
  const result: HubSearch = {}
  if (typeof search.page === 'number') {
    result.page = search.page
  }
  if (search.sort === 'asc' || search.sort === 'desc') {
    result.sort = search.sort
  }
  return result
}

export const sortedSearch = { sort: 'desc' } as const

export function detailMarker(id: string) {
  return `detail-${id}`
}

export const listMarker = 'list'
export const listSortedMarker = 'list-desc'
export const otherMarker = 'other'

// Sampled Links whose href depends on the current location: the first layout
// `to="."` updater Link and the first list `to="."` updater Link.
export const hubRelativeTestId = 'hub-relative-1'
export const listRelativeTestId = 'list-relative-1'

interface StepDef {
  testId: string
  marker: string
  /** Expected number of `.active-link` elements after the step. */
  activeCount: number
  /** Expected href of the sampled layout updater Link (null: not mounted). */
  hubRelativeHref: string | null
  /** Expected href of the sampled list updater Link (null: not mounted). */
  listRelativeHref: string | null
}

// On the list, every layout `includeSearch: false` Link to the list is active.
const listActiveCount = HUB_ITEM_COUNT

export const stepDefs: ReadonlyArray<StepDef> = [
  // 1. list -> detail/1: list Links depart, layout Links stay and update.
  {
    testId: 'go-detail-1',
    marker: detailMarker('1'),
    activeCount: 1,
    hubRelativeHref: '/hub/detail/1?page=1',
    listRelativeHref: null,
  },
  // 2. detail/1 -> detail/2: same route, new param; every Link stays.
  {
    testId: 'go-detail-2',
    marker: detailMarker('2'),
    activeCount: 1,
    hubRelativeHref: '/hub/detail/2?page=1',
    listRelativeHref: null,
  },
  // 3. detail/2 -> list: list Links mount.
  {
    testId: 'go-list',
    marker: listMarker,
    activeCount: listActiveCount,
    hubRelativeHref: '/hub/list?page=1',
    listRelativeHref: '/hub/list?page=1&sort=asc',
  },
  // 4. list -> other: layout and list Links depart together.
  {
    testId: 'go-other',
    marker: otherMarker,
    activeCount: 0,
    hubRelativeHref: null,
    listRelativeHref: null,
  },
  // 5. other -> list: layout and list Links all mount.
  {
    testId: 'go-list',
    marker: listMarker,
    activeCount: listActiveCount,
    hubRelativeHref: '/hub/list?page=1',
    listRelativeHref: '/hub/list?page=1&sort=asc',
  },
  // 6a. list -> list?sort=desc: nothing departs, updater Links rebuild.
  {
    testId: 'go-list-sorted',
    marker: listSortedMarker,
    activeCount: listActiveCount,
    hubRelativeHref: '/hub/list?sort=desc&page=1',
    listRelativeHref: '/hub/list?sort=asc&page=1',
  },
  // 6b. back to the plain list so the lap ends on the initial location.
  {
    testId: 'go-list',
    marker: listMarker,
    activeCount: listActiveCount,
    hubRelativeHref: '/hub/list?page=1',
    listRelativeHref: '/hub/list?page=1&sort=asc',
  },
]

export const initialUrl = '/hub/list'

export const scenarioSteps: ReadonlyArray<ScenarioStep> = stepDefs.map(
  (step) => step.testId,
)

function assertHref(
  container: HTMLElement,
  testId: string,
  expected: string | null,
  stepIndex: number,
) {
  const link = container.querySelector(`[data-testid="${testId}"]`)
  const href = link ? link.getAttribute('href') : null
  if (href !== expected) {
    throw new Error(
      `Expected "${testId}" href ${JSON.stringify(expected)} after step ${stepIndex}, received ${JSON.stringify(href)}`,
    )
  }
}

export function assertStepResult(stepIndex: number, container: HTMLElement) {
  const step = stepDefs[stepIndex]!

  const marker = container.querySelector('[data-testid="page-state"]')
  if (marker?.textContent !== step.marker) {
    throw new Error(
      `Expected page marker "${step.marker}" after step ${stepIndex}, received "${marker?.textContent}"`,
    )
  }

  const activeLinks = container.querySelectorAll('a.active-link')
  if (activeLinks.length !== step.activeCount) {
    throw new Error(
      `Expected ${step.activeCount} active link(s) after step ${stepIndex}, received ${activeLinks.length}`,
    )
  }

  assertHref(container, hubRelativeTestId, step.hubRelativeHref, stepIndex)
  assertHref(container, listRelativeTestId, step.listRelativeHref, stepIndex)
}

// One lap through the 7-step sequence per benchmark iteration.
export const ticksPerIteration = stepDefs.length

export const benchOptions = {
  warmupIterations: 50,
  time: 10_000,
  throws: true,
}
