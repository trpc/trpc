import { publicOS } from '@/orpc'
import { openapi } from '@orpc/openapi'
import { asyncIteratorObject } from '@orpc/server'
import { z } from 'zod'

export const publishMessage = publicOS
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
  .handler(async ({ context }, { channel, message }) => {
    await context.messagePublisher.publish(channel, { message })
  })

export const subscribeMessages = publicOS
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
  .handler(async ({ context, signal, lastEventId }, { channel }) => {
    return context.messagePublisher.subscribe(channel, { signal, lastEventId })
  })
