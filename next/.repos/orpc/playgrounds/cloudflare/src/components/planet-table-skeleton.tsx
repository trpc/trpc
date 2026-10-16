export function PlanetTableSkeleton() {
  return (
    <section className="module module--amber" aria-busy="true" aria-label="Loading planet registry">
      <span className="corner tl" />
      <span className="corner tr" />
      <span className="corner bl" />
      <span className="corner br" />

      <div className="module-head">
        <div>
          <span className="module-id">QR-02 · QUERY</span>
          <h2 className="module-title">oRPC and Tanstack Query | List Planets example</h2>
          <p className="module-desc">
            Cursor-paginated query against the planet list, kept fresh by TanStack Query.
          </p>
        </div>
        <span className="status-pill">
          <span className="dot" />
          <span className="status-text">Loading</span>
        </span>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Description</th>
              <th>Image</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 2 }).map((_, i) => (
              <tr key={i} style={{ '--delay': `${i * 80}ms` } as React.CSSProperties}>
                <td data-label="ID"><span className="skeleton-bar skeleton-bar--lg" /></td>
                <td data-label="Name"><span className="skeleton-bar skeleton-bar--md" /></td>
                <td data-label="Description"><span className="skeleton-bar skeleton-bar--lg" /></td>
                <td data-label="Image"><span className="skeleton-thumb" /></td>
                <td data-label="Actions"><span className="skeleton-thumb skeleton-thumb--sm" /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>
                <div className="table-actions">
                  <span className="skeleton-bar skeleton-bar--sm" />
                  <div className="btn-group">
                    <span className="skeleton-bar skeleton-bar--btn" />
                    <span className="skeleton-bar skeleton-bar--btn" />
                  </div>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
