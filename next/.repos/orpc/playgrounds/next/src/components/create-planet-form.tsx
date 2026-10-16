'use client'

import { orpc } from '@/lib/orpc'
import { getIssueMessage } from '@orpc/next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

export function CreatePlanetForm() {
  const queryClient = useQueryClient()
  const [fileName, setFileName] = useState<string | null>(null)

  const { mutate, isPending, error } = useMutation(
    orpc.planet.create.mutationOptions({
      onSuccess() {
        queryClient.invalidateQueries({
          queryKey: orpc.planet.key(),
        })
      },
    }),
  )

  return (
    <section className="module module--cyan" aria-labelledby="create-planet-title">
      <span className="corner tl" />
      <span className="corner tr" />
      <span className="corner bl" />
      <span className="corner br" />

      <div className="module-head">
        <div>
          <span className="module-id">TX-01 · MUTATION</span>
          <h2 className="module-title" id="create-planet-title">
            oRPC and Tanstack Query | Create Planet example
          </h2>
          <p className="module-desc">
            Submitting calls an oRPC mutation, then TanStack Query invalidates the registry below.
          </p>
        </div>
        <span className="status-pill">
          <span className="dot" />
          <span className="status-text">{isPending ? 'Transmitting' : 'Idle'}</span>
        </span>
      </div>

      <form
        action={(form) => {
          const name = form.get('name') as string
          const description = (form.get('description') as string | null) ?? undefined
          const image = form.get('image') as File

          mutate({ name, description, image: image.size > 0 ? image : undefined })
        }}
      >
        <div className="field">
          <label className="field-label" htmlFor="planet-name">Name</label>
          <input id="planet-name" type="text" name="name" required />
          <p className="field-error">{getIssueMessage(error, 'name')}</p>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="planet-description">Description</label>
          <textarea id="planet-description" name="description" />
        </div>

        <div className="field">
          <span className="field-label">Image</span>
          <div className="file-field">
            <input
              id="planet-image"
              className="file-input-hidden"
              type="file"
              name="image"
              accept="image/*"
              onChange={e => setFileName(e.target.files?.[0]?.name ?? null)}
            />
            <label htmlFor="planet-image" className="btn btn-ghost">Attach file</label>
            <span className="file-name">{fileName ?? 'No file selected'}</span>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn" disabled={isPending}>
            {isPending ? 'Transmitting ►' : 'Transmit ►'}
          </button>
        </div>
      </form>
    </section>
  )
}
