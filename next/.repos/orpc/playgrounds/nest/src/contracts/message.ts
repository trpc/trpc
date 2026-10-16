import { oc } from '@orpc/contract'
import { openapi } from '@orpc/openapi'
import { asyncIteratorObject } from '@orpc/server'
import { z } from 'zod'

export const publishMessage = oc
  .meta(openapi({
    method: 'POST',
    path: '/messages/{channel}',
    summary: 'Publish a message to a channel',
    tags: ['Message'],
  }))
  .input(z.object({
    channel: z.string().describe('Channel name, use an unguessable unique value for security'),
    message: z.string(),
  }))

export const subscribeMessages = oc
  .meta(openapi({
    method: 'GET',
    path: '/messages/{channel}',
    summary: 'Subscribe to messages from a channel',
    tags: ['Message'],
  }))
  .input(z.object({
    channel: z.string().describe('Channel name, use an unguessable unique value for security'),
  }))
  .output(asyncIteratorObject(z.object({
    message: z.string(),
  })))
