import type { AdSponsor } from './ads'
import { relAttribute, soldSponsors, tintStyle } from './ads'

// Only the inline slots rotate. The grid is static and carries no
// [data-sponsor-slot], so nothing here touches it.

function setText(card: Element, selector: string, text: string): void {
  const target = card.querySelector(selector)
  if (target) {
    target.textContent = text
  }
}

/**
 * Rewrite a server-rendered card in place, matching what AdCard.astro would
 * have emitted for this sponsor. Geometry is fixed, so nothing moves.
 */
function apply(card: HTMLAnchorElement, sponsor: AdSponsor): void {
  card.href = sponsor.href
  card.rel = relAttribute(sponsor.rel)
  // The tagline truncates in the card, so it doubles as the hover tooltip.
  card.title = sponsor.description

  const logo = card.querySelector<HTMLImageElement>('[data-sponsor-logo]')
  if (logo) {
    logo.src = sponsor.logo
  }
  setText(card, '[data-sponsor-name]', sponsor.name)
  setText(card, '[data-sponsor-desc]', sponsor.description)

  // Dropping the attribute rather than blanking it keeps an untinted sponsor
  // from inheriting the outgoing one's colour.
  const tint = tintStyle(sponsor)
  if (tint === undefined) {
    card.removeAttribute('style')
  }
  else {
    card.setAttribute('style', tint)
  }
}

/** `count` distinct sponsors in random order, or all of them if the pool is smaller. */
function sample(pool: AdSponsor[], count: number): AdSponsor[] {
  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
  }
  return shuffled.slice(0, count)
}

/**
 * Give each inline slot a fresh set of sponsors. Runs on every page load (the
 * site is an MPA). Slots draw independently and without replacement, so one
 * slot never repeats a sponsor, though two slots on a page may overlap.
 */
function rotate(): void {
  const pool = soldSponsors()
  if (pool.length < 2) {
    // Nothing to vary: the server already rendered the only possible order.
    return
  }

  for (const slot of document.querySelectorAll('[data-sponsor-slot]')) {
    const cards = slot.querySelectorAll<HTMLAnchorElement>('[data-sponsor-card]')
    sample(pool, cards.length).forEach((sponsor, index) => {
      const card = cards[index]
      if (card) {
        apply(card, sponsor)
      }
    })
  }
}

// Blume injects this as a module script, so it runs after the document is
// parsed; the guard only covers a non-deferred injection.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', rotate)
}
else {
  rotate()
}
