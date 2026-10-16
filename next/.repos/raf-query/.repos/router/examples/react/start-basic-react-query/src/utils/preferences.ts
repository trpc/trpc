import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import {
  getCookie,
  setCookie,
  setResponseHeader,
} from '@tanstack/react-start/server'

export const getReaderName = createServerFn({ method: 'GET' }).handler(() => {
  setResponseHeader('Cache-Control', 'private, no-store')
  return getCookie('reader-name') || 'Guest'
})

export const saveReaderName = createServerFn({ method: 'POST' })
  .validator((name: string) => {
    if (typeof name !== 'string' || !name.trim() || name.length > 40) {
      throw new Error('Enter a name between 1 and 40 characters')
    }
    return name.trim()
  })
  .handler(({ data }) => {
    setResponseHeader('Cache-Control', 'private, no-store')
    setCookie('reader-name', data, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    })
  })

export const readerNameOptions = queryOptions({
  queryKey: ['reader-name'],
  queryFn: () => getReaderName(),
})
