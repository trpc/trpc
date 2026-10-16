import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, useHydrated } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { readerNameOptions, saveReaderName } from '../utils/preferences'

export const Route = createFileRoute('/preferences')({
  loader: async ({ context }) => {
    await context.queryClient.query(readerNameOptions)
  },
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  head: () => ({ meta: [{ title: 'Reader preferences' }] }),
  component: Preferences,
})

function Preferences() {
  const { data: name } = useSuspenseQuery(readerNameOptions)
  const queryClient = useQueryClient()
  const save = useServerFn(saveReaderName)
  const hydrated = useHydrated()
  const mutation = useMutation({
    mutationFn: (name: string) => save({ data: name }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: readerNameOptions.queryKey }),
  })

  return (
    <main className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Reader preferences</h1>
      <p data-testid="reader-name">Hello, {name}</p>
      <form
        method="post"
        onSubmit={(event) => {
          event.preventDefault()
          const value = new FormData(event.currentTarget).get('name')
          if (typeof value === 'string') {
            mutation.mutate(value)
          }
        }}
      >
        <fieldset
          disabled={!hydrated || mutation.isPending}
          className="flex gap-3"
        >
          <label>
            Display name{' '}
            <input
              name="name"
              defaultValue={name}
              maxLength={40}
              required
              className="rounded border p-1"
            />
          </label>
          <button type="submit" className="rounded border px-3">
            {mutation.isPending ? 'Saving...' : 'Save name'}
          </button>
        </fieldset>
        {mutation.isError ? (
          <p role="alert">Could not save your name. Try again.</p>
        ) : null}
      </form>
    </main>
  )
}
