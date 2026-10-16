import { protectedOS, publicOS } from '../orpc'
import { openapi } from '@orpc/openapi'
import z from 'zod'

const FILES = new Map<string, File>()

export const uploadFile = protectedOS
  .meta(openapi({
    method: 'POST',
    path: '/files',
    summary: 'Upload a file',
    tags: ['File'],
  }))
  .input(z.file())
  .output(z.object({ id: z.uuid() }))
  .handler(({ input }) => {
    const id = crypto.randomUUID()
    FILES.set(id, input)
    return { id }
  })

export const deleteFile = protectedOS
  .meta(openapi({
    method: 'DELETE',
    path: '/files/{id}',
    summary: 'Delete a file',
    tags: ['File'],
  }))
  .input(z.object({ id: z.uuid() }))
  .handler(({ input }) => {
    FILES.delete(input.id)
  })

export const findFile = publicOS
  .meta(openapi({
    method: 'GET',
    path: '/files/{id}',
    summary: 'Find a file',
    tags: ['File'],
  }))
  .input(z.object({ id: z.uuid() }))
  .output(z.file())
  .errors({ NOT_FOUND: { message: 'File not found' } })
  .handler(({ input, errors }) => {
    const file = FILES.get(input.id)

    if (!file) {
      throw errors.NOT_FOUND()
    }

    return file
  })
