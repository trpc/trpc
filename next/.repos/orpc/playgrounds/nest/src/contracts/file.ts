import { oc } from '@orpc/contract'
import { openapi } from '@orpc/openapi'
import z from 'zod'
import { bearAuthMeta } from '../meta'

export const uploadFile = oc
  .meta(bearAuthMeta)
  .meta(openapi({
    method: 'POST',
    path: '/files',
    summary: 'Upload a file',
    tags: ['File'],
  }))
  .input(z.file())
  .output(z.object({ id: z.uuid() }))

export const deleteFile = oc
  .meta(bearAuthMeta)
  .meta(openapi({
    method: 'DELETE',
    path: '/files/{id}',
    summary: 'Delete a file',
    tags: ['File'],
  }))
  .input(z.object({ id: z.uuid() }))

export const findFile = oc
  .meta(openapi({
    method: 'GET',
    path: '/files/{id}',
    summary: 'Find a file',
    tags: ['File'],
  }))
  .input(z.object({ id: z.uuid() }))
  .output(z.file())
  .errors({ NOT_FOUND: { message: 'File not found' } })
