const referenceLinks = [
  {
    href: '/api',
    label: 'OpenAPI Reference',
    description: 'Browse every procedure, powered by Scalar.',
  },
  {
    href: 'http://localhost:16686',
    label: 'Jaeger Dashboard',
    description: 'Trace requests as they flow through the oRPC pipeline - "npm run jaeger"',
  },
]

export function ReferenceLinks() {
  return (
    <section className="module module--ref" aria-labelledby="reference-links-title">
      <span className="corner tl" />
      <span className="corner tr" />
      <span className="corner bl" />
      <span className="corner br" />

      <div className="module-head">
        <div>
          <span className="module-id">REF · LINKS</span>
          <h2 className="module-title" id="reference-links-title">Reference links</h2>
        </div>
      </div>

      <ul className="ref-list">
        {referenceLinks.map(link => (
          <li key={link.href}>
            <a
              href={link.href}
              className="ref-link-row"
              target="_blank"
            >
              <span className="ref-link-text">
                <span className="ref-link-label">{link.label}</span>
                <span className="ref-link-desc">{link.description}</span>
              </span>
              <span className="ref-link-arrow">↗</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
