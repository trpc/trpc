import { Controller } from '@nestjs/common'
import { Implement } from '@orpc/nest'
import { implement } from '@orpc/server'
import { contract } from '../contracts'

@Controller()
export class MessageController {
  constructor() {}

  @Implement(contract.message.publish)
  publish() {
    return implement(contract.message.publish).handler(async ({ context }, { channel, message }) => {
      await context.messagePublisher.publish(channel, { message })
    })
  }

  @Implement(contract.message.subscribe)
  subscribe() {
    return implement(contract.message.subscribe).handler(async ({ context, signal, lastEventId }, { channel }) => {
      return context.messagePublisher.subscribe(channel, { signal, lastEventId })
    })
  }
}
