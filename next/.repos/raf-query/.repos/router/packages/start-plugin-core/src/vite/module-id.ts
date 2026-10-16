/** Checks for a query parameter without rewriting the opaque module ID. */
export function hasIdQueryFlag(id: string, flag: string): boolean {
  const queryIndex = id.indexOf('?')
  if (queryIndex === -1) {
    return false
  }

  return new URLSearchParams(id.slice(queryIndex + 1)).has(flag)
}

/** Appends an owned query flag without normalizing the existing query. */
export function appendIdQueryFlag(id: string, flag: string): string {
  if (!id.includes('?')) {
    return `${id}?${flag}`
  }

  const separator = id.endsWith('&') ? '' : '&'
  return `${id}${separator}${flag}`
}

/** Removes the owned query flag appended by {@link appendIdQueryFlag}. */
export function removeIdQueryFlag(id: string, flag: string): string {
  for (const separator of ['?', '&']) {
    const suffix = `${separator}${flag}`
    if (id.endsWith(suffix)) {
      return id.slice(0, -suffix.length)
    }
  }

  return id
}
