// Open Collective's image host answers some visitors with a bot challenge
// instead of the image, so a broken avatar becomes a first-letter tile
// built from its `data-monogram` name.

function monogram(name: string): string {
  const letter = (Array.from(name.trim())[0] ?? '?').toUpperCase().replace(/[<>&'"]/gu, '')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#8b8f98"/><text x="16" y="21.5" fill="#fff" font-family="system-ui,sans-serif" font-size="15" font-weight="600" text-anchor="middle">${letter}</text></svg>`

  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function useMonogram(image: HTMLImageElement): void {
  const name = image.dataset.monogram

  if (name !== undefined && !image.src.startsWith('data:')) {
    image.src = monogram(name)
  }
}

function sweep(): void {
  for (const image of document.querySelectorAll<HTMLImageElement>('img[data-monogram]')) {
    if (image.complete && image.naturalWidth === 0) {
      useMonogram(image)
    }
  }
}

// `error` does not bubble, so it is caught in the capture phase; the sweep
// covers images that failed before this deferred module ran.
document.addEventListener('error', (event) => {
  if (event.target instanceof HTMLImageElement) {
    useMonogram(event.target)
  }
}, true)

sweep()
