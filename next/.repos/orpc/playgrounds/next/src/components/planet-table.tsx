'use client'

import { orpc } from '@/lib/orpc'
import { useMutation, useQueryClient, useSuspenseInfiniteQuery } from '@tanstack/react-query'

export function PlanetTable() {
  const { data, refetch, fetchNextPage, hasNextPage, status } = useSuspenseInfiniteQuery(
    orpc.planet.list.infiniteOptions({
      input: cursor => ({ cursor, limit: 5 }),
      getNextPageParam: (lastPage, _, lastCursor) => lastPage.length === 5 ? lastCursor + 5 : null,
      initialPageParam: 0,
    }),
  )

  const queryClient = useQueryClient()
  const deleteMutation = useMutation(
    orpc.planet.delete.mutationOptions({
      onSuccess() {
        queryClient.invalidateQueries({
          queryKey: orpc.planet.key(),
        })
      },
      onError(error) {
        alert(String(error))
      },
    }),
  )

  if (status === 'error') {
    return <p className="module-error">Something went wrong.</p>
  }

  const planetCount = data.pages.reduce((total, page) => total + page.length, 0)

  return (
    <section className="module module--amber" aria-labelledby="planet-table-title">
      <span className="corner tl" />
      <span className="corner tr" />
      <span className="corner bl" />
      <span className="corner br" />

      <div className="module-head">
        <div>
          <span className="module-id">QR-02 · QUERY</span>
          <h2 className="module-title" id="planet-table-title">
            oRPC and Tanstack Query | List Planets example
          </h2>
          <p className="module-desc">
            Cursor-paginated query against the planet list, kept fresh by TanStack Query.
          </p>
        </div>
        <span className="status-pill">
          <span className="dot" />
          <span className="status-text">Synced</span>
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
            {data.pages.flatMap((page, i) =>
              page.map((planet) => {
                const isDeleting = deleteMutation.isPending && deleteMutation.variables?.id === planet.id

                return (
                  <tr key={`${planet.id}-${i}`}>
                    <td className="cell-id" data-label="ID" title={planet.id}>{planet.id}</td>
                    <td data-label="Name">{planet.name}</td>
                    <td className="cell-desc" data-label="Description">{planet.description}</td>
                    <td data-label="Image">
                      {planet.image
                        ? (
                            <img
                              className="cell-image-thumb"
                              width={32}
                              height={32}
                              src={`/api/files/${planet.image}`}
                              alt={planet.name}
                            />
                          )
                        : <span className="img-ph">—</span>}
                    </td>
                    <td data-label="Actions">
                      <button
                        type="button"
                        className="btn-delete"
                        aria-label={`Delete ${planet.name}`}
                        disabled={isDeleting}
                        onClick={() => {
                          if (window.confirm(`Delete ${planet.name}? This can't be undone.`)) {
                            deleteMutation.mutate({ id: planet.id })
                          }
                        }}
                      >
                        {isDeleting ? '…' : '✕'}
                      </button>
                    </td>
                  </tr>
                )
              }),
            )}
          </tbody>

          <tfoot>
            <tr>
              <td colSpan={5}>
                <div className="table-actions">
                  <span className="registry-count">
                    {planetCount}
                    {' '}
                    planet
                    {planetCount === 1 ? '' : 's'}
                    {' '}
                    loaded
                  </span>
                  <div className="btn-group">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => fetchNextPage()}
                      disabled={!hasNextPage}
                    >
                      Load more
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => refetch()}>
                      Refresh
                    </button>
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
