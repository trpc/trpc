// The hand-edited list behind /experts. The page renders entries in this order.
// Delete an entry to unlist someone. A listing is no guarantee from oRPC; the
// only arrangement is the commission.

const EXPERTS_EMAIL = 'dinwwwh@gmail.com'

export interface Expert {
  /** Display name of the person or company. */
  name: string
  /** GitHub login; supplies the avatar and the profile link. */
  github: string
  /** Avatar shape: round for a person, rounded square for a company. */
  type: 'person' | 'company'
  /** One line on what they do, under 80 characters. */
  headline: string
  /** City and country, or a region with a time zone. */
  location: string
  /** One to four short skills, e.g. "OpenAPI". Extras are not rendered. */
  skills: string[]
  /** Where clients reach them. */
  contact: `https://${string}` | `mailto:${string}`
  /** Percentage of what clients pay them for oRPC work that they give to oRPC; each expert picks it. */
  commission: number
}

export const experts: Expert[] = []

// Percent-encoded by hand like advertiseHref: URLSearchParams writes spaces as
// "+", which mail clients show literally.
function mailto(subject: string, body: string[]): string {
  return `mailto:${EXPERTS_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.join('\n'))}`
}

/** Prefilled application. Every field but the sponsor account, which is for checking the commission, maps to one `Expert` field. */
export function joinHref(): string {
  return mailto('oRPC experts listing', [
    'Hi,',
    '',
    'Please list me on orpc.dev/experts. I will give oRPC the percentage below of what clients pay me for oRPC work, through GitHub Sponsors or Open Collective.',
    '',
    'Name: ',
    'Person or company: ',
    'GitHub login: ',
    'Headline (one line): ',
    'Location: ',
    'Skills (up to 4): ',
    'Contact (https link or email): ',
    'Percentage I give back (one number): ',
    'Sponsor account (GitHub or Open Collective): ',
  ])
}

/** Reports name people, so they go to a private inbox rather than GitHub issues. */
export function feedbackHref(): string {
  return mailto('Feedback on an oRPC expert', [
    'Expert\'s name: ',
    'When you worked together: ',
    'What happened: ',
  ])
}
