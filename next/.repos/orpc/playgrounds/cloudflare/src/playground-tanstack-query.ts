import { isDefinedError } from '@orpc/client'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { orpc } from './lib/orpc'

const queryClient = useQueryClient()

const query = useInfiniteQuery(
  orpc.planet.list.infiniteOptions({
    input: cursor => ({ cursor, limit: 5 }),
    getNextPageParam: (lastPage, _, lastCursor) => lastPage.length === 5 ? lastCursor + 5 : null,
    initialPageParam: 0,
  }),
)

const mutation = useMutation(
  orpc.planet.update.mutationOptions({
    onError(error) {
      if (isDefinedError(error)) {
        const code = error.code
        //    ^    typesafe
      }
    },
    onSuccess() {
      queryClient.invalidateQueries({
        queryKey: orpc.planet.key(),
      })
    },
  }),
)
