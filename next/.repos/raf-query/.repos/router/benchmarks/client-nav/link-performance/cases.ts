export const LINK_CASES = [
  {
    id: 'shared-params',
    label: 'Shared string params',
    description: '200 persistent Links reuse 40 string parameter values.',
  },
  {
    id: 'unique-params',
    label: 'Unique string params',
    description: '200 distinct parameter values exceed the 128-result cache.',
  },
  {
    id: 'param-updaters',
    label: 'Parameter updaters',
    description: 'Parameter functions derive destinations from current params.',
  },
  {
    id: 'location-updaters',
    label: 'Search, hash and state updaters',
    description:
      'Functions derive search, hash and history state from the source.',
  },
  {
    id: 'relative',
    label: 'Relative targets',
    description: 'Parent and child targets inherit current params and search.',
  },
  {
    id: 'middleware',
    label: 'Search middleware chain',
    description:
      'Retain a tenant, strip a default page and normalize a filter.',
  },
  {
    id: 'numeric-params',
    label: 'Numeric params',
    description: 'Parse numbers, update them numerically and stringify them.',
  },
  {
    id: 'optional-params',
    label: 'Optional segments',
    description: 'Set, inherit and explicitly clear an optional path segment.',
  },
  {
    id: 'splats',
    label: 'Splat params',
    description: 'Empty, multi-segment and encoded splat values.',
  },
  {
    id: 'encoding',
    label: 'Allowed path characters',
    description: 'Preserve allowed @, : and + while encoding other characters.',
  },
  {
    id: 'masks',
    label: 'Explicit route masks',
    description:
      'Build a different public path and search for each destination.',
  },
  {
    id: 'rewrites',
    label: 'Basepath and rewrites',
    description: 'Compose /app with input/output locale path rewrites.',
  },
  {
    id: 'active',
    label: 'Active props and structured search',
    description:
      'Exact, fuzzy and search matching with props and render children.',
  },
] as const

export type LinkCaseId = (typeof LINK_CASES)[number]['id']

export const LINK_COUNT = 200
export const NAVIGATION_STATES = [1, 2, 3, 0] as const
export const LOCALES = ['en', 'fr', 'de', 'es'] as const

export interface Filter {
  tag: string
  flags: { open: boolean }
  tags: Array<string>
}

export interface LinkSearch {
  page?: number
  tenant?: string
  filter?: Filter
}

export function sourceFilter(index: number): Filter {
  return {
    tag: `group-${index}`,
    flags: { open: index % 2 === 0 },
    tags: ['links', `state-${index}`],
  }
}

export function sourceSearch(
  caseId: LinkCaseId,
  stateIndex: number,
): Partial<LinkSearch> {
  switch (caseId) {
    case 'location-updaters':
    case 'relative':
    case 'middleware':
    case 'active':
      return {
        page: stateIndex + 1,
        tenant: `tenant-${stateIndex}`,
        filter: sourceFilter(stateIndex),
      }
    case 'rewrites':
      return { tenant: LOCALES[stateIndex] }
    default:
      return {}
  }
}

export function optionalCategory(stateIndex: number) {
  return stateIndex % 2 === 0 ? `category-${stateIndex}` : undefined
}

export function splatValue(index: number) {
  switch (index % 4) {
    case 0:
      return ''
    case 1:
      return `folder/sub/file-${index % 40}`
    case 2:
      return 'a b/100%/caf\u00e9?#'
    default:
      return 'literal%2F/\u{1f680}'
  }
}

export function encodedValue(index: number) {
  return `user-${index % 40}@mail.test:tag+value /?#% caf\u00e9`
}

function url(pathname: string, search: Partial<LinkSearch> = {}, hash = '') {
  const result = new URL(pathname, 'http://localhost')
  for (const [key, value] of Object.entries<LinkSearch[keyof LinkSearch]>(
    search,
  )) {
    if (value !== undefined) {
      result.searchParams.set(
        key,
        typeof value === 'object' ? JSON.stringify(value) : String(value),
      )
    }
  }
  result.hash = hash
  return result.pathname + result.search + result.hash
}

function sourcePath(caseId: LinkCaseId, stateIndex: number) {
  switch (caseId) {
    case 'relative':
      return `/teams/team-${stateIndex}/item-${stateIndex}`
    case 'numeric-params':
      return `/numbers/${stateIndex}`
    case 'optional-params': {
      const category = optionalCategory(stateIndex)
      return `/optional/${category ? `${category}/` : ''}item-${stateIndex}`
    }
    case 'splats':
      return `/files/source/state-${stateIndex}`
    case 'encoding':
      return `/encoded/source-${stateIndex}`
    case 'active':
      return `/items/item-${stateIndex}/details`
    default:
      return `/items/item-${stateIndex}`
  }
}

export function getSourceUrl(caseId: LinkCaseId, stateIndex: number): string {
  if (!Number.isInteger(stateIndex) || stateIndex < 0 || stateIndex > 3) {
    throw new Error(`Invalid Link performance state: ${stateIndex}`)
  }
  const pathname = sourcePath(caseId, stateIndex)
  if (caseId === 'rewrites') {
    return `/app/${LOCALES[stateIndex]}${pathname}`
  }
  return url(
    pathname,
    sourceSearch(caseId, stateIndex),
    caseId === 'location-updaters' ? `source-${stateIndex}` : '',
  )
}

// These expectations use fixture values and platform encoding, not router APIs.
function expectedHref(caseId: LinkCaseId, stateIndex: number, index: number) {
  const itemId = `item-${index % 40}`
  switch (caseId) {
    case 'shared-params':
      return `/items/${itemId}`
    case 'unique-params':
      return `/items/item-${index}`
    case 'param-updaters':
      return `/items/item-${stateIndex}-related-${index % 40}`
    case 'location-updaters':
      return url(
        `/items/item-${stateIndex}`,
        {
          ...sourceSearch(caseId, stateIndex),
          page: stateIndex + 2 + (index % 5),
        },
        `source-${stateIndex}-link-${index % 5}`,
      )
    case 'relative':
      return url(
        index % 2 === 0
          ? `/teams/team-${stateIndex}`
          : `/teams/team-${stateIndex}/item-${stateIndex}/details`,
        sourceSearch(caseId, stateIndex),
      )
    case 'middleware':
      return url(`/filtered/${itemId}`, {
        tenant: `tenant-${stateIndex}`,
        page: index % 2 === 0 ? undefined : 2,
        filter: { ...sourceFilter(index % 4), tag: `LABEL-${index % 40}` },
      })
    case 'numeric-params':
      return `/numbers/${stateIndex + (index % 40)}`
    case 'optional-params': {
      const category =
        index % 3 === 0
          ? 'fixed'
          : index % 3 === 1
            ? optionalCategory(stateIndex)
            : undefined
      return `/optional/${category ? `${category}/` : ''}${itemId}`
    }
    case 'splats': {
      const value = splatValue(index)
      return `/files${value ? `/${value.split('/').map(encodeURIComponent).join('/')}` : ''}`
    }
    case 'encoding': {
      const value = encodeURIComponent(encodedValue(index))
        .replaceAll('%40', '@')
        .replaceAll('%3A', ':')
        .replaceAll('%2B', '+')
      return `/encoded/${value}`
    }
    case 'masks':
      return url(`/public/display-${index % 40}`, {
        tenant: `mask-${index % 4}`,
      })
    case 'rewrites':
      return url(`/app/${LOCALES[index % 4]}/items/${itemId}`, {
        page: (index % 3) + 1,
      })
    case 'active': {
      const item = Math.floor(index / 5)
      const variant = index % 5
      const search =
        variant < 3
          ? { filter: sourceFilter(item % 4) }
          : {
              ...sourceSearch('active', item % 4),
              ...(variant === 4 ? { filter: undefined } : {}),
            }
      return url(`/items/item-${item}${variant < 2 ? '' : '/details'}`, search)
    }
  }
}

function assertUrl(
  actualHref: string | null,
  expectedHref: string,
  label: string,
) {
  if (actualHref === null) {
    throw new Error(`${label}: missing href`)
  }
  const actual = new URL(actualHref, 'http://localhost')
  const expected = new URL(expectedHref, 'http://localhost')
  // Query ordering and the platform's '+' versus '%20' are immaterial here.
  const query = (value: URL) =>
    JSON.stringify([...value.searchParams.entries()].sort())
  if (
    actual.origin !== expected.origin ||
    actual.pathname !== expected.pathname ||
    actual.hash !== expected.hash ||
    query(actual) !== query(expected)
  ) {
    throw new Error(
      `${label}: expected ${expectedHref}, received ${actualHref}`,
    )
  }
}

export function assertScenario(
  caseId: LinkCaseId,
  stateIndex: number,
  root: ParentNode,
): void {
  const source = root.querySelector('[data-testid="source-path"]')
  if (source?.textContent !== sourcePath(caseId, stateIndex)) {
    throw new Error(
      `${caseId}/${stateIndex}: unexpected source path ${source?.textContent}`,
    )
  }
  const links = root.querySelectorAll<HTMLAnchorElement>('a[data-perf-link]')
  if (links.length !== LINK_COUNT) {
    throw new Error(
      `${caseId}: expected ${LINK_COUNT} Links, got ${links.length}`,
    )
  }
  for (const [index, link] of links.entries()) {
    const label = `${caseId}/${stateIndex}/link-${index}`
    if (link.getAttribute('data-perf-link') !== String(index)) {
      throw new Error(`${label}: unexpected Link order`)
    }
    assertUrl(
      link.getAttribute('href'),
      expectedHref(caseId, stateIndex, index),
      label,
    )
    let active: boolean | undefined
    if (caseId === 'shared-params') {
      active = index % 40 === stateIndex
    } else if (caseId === 'unique-params') {
      active = index === stateIndex
    } else if (caseId === 'active') {
      active =
        Math.floor(index / 5) === stateIndex && [0, 2, 3].includes(index % 5)
      if (
        link.textContent !== `${index}:${active ? 'active' : 'inactive'}` ||
        link.getAttribute('title') !== (active ? 'active' : 'inactive') ||
        !link.classList.contains(active ? 'perf-active' : 'perf-inactive') ||
        link.style.color !== (active ? 'green' : 'gray') ||
        link.style.opacity !== '0.8'
      ) {
        throw new Error(
          `${label}: active props or render children are incorrect`,
        )
      }
    }
    if (
      active !== undefined &&
      (link.getAttribute('data-status') === 'active') !== active
    ) {
      throw new Error(`${label}: expected active=${active}`)
    }
  }
  for (let state = 0; state < 4; state++) {
    const control = root.querySelector(`[data-testid="go-state-${state}"]`)
    if (!control || control.hasAttribute('data-perf-link')) {
      throw new Error(`${caseId}: missing or measured control Link ${state}`)
    }
    assertUrl(
      control.getAttribute('href'),
      getSourceUrl(caseId, state),
      `${caseId}/control-${state}`,
    )
  }
}
