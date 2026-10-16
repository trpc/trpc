const wholeUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })
const centsUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function usd(value: number): string {
  return (Number.isInteger(value) ? wholeUsd : centsUsd).format(value)
}

// UTC, or a sponsorship that started near midnight lands in a different month
// depending on the build machine's zone.
const monthYearFormat = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })

export function monthYear(iso: string): string {
  return monthYearFormat.format(new Date(iso))
}

export function linkLabel(link: string): string {
  const url = new URL(link)
  const host = url.hostname.replace(/^www\./u, '')

  return host === 'opencollective.com' ? 'Open Collective' : `${host}${url.pathname.replace(/\/$/u, '')}`
}
