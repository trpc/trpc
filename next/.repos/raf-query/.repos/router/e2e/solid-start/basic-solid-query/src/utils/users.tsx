import { queryOptions } from '@tanstack/solid-query'
import { createIsomorphicFn } from '@tanstack/solid-start'
import { getRequestUrl } from '@tanstack/solid-start/server'
import axios from 'redaxios'

export type User = {
  id: number
  name: string
  email: string
}

const getOrigin = createIsomorphicFn()
  .server(() => getRequestUrl().origin)
  .client(() => window.location.origin)

export const usersQueryOptions = () =>
  queryOptions({
    queryKey: ['users'],
    queryFn: () =>
      axios
        .get<Array<User>>(getOrigin() + '/api/users')
        .then((r) => r.data)
        .catch(() => {
          throw new Error('Failed to fetch users')
        }),
  })

export const userQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['users', id],
    queryFn: () =>
      axios
        .get<User>(getOrigin() + '/api/users/' + id)
        .then((r) => r.data)
        .catch(() => {
          throw new Error('Failed to fetch user')
        }),
  })
