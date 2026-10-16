import { AbortError } from '@standard-server/shared'

export interface AsyncIdQueueCloseOptions {
  id?: string
  reason?: unknown
}

export class AsyncIdQueue<T> {
  private readonly openIds = new Set<string>()
  private readonly queues = new Map<string, T[]>()
  private readonly waiters = new Map<string, (readonly [resolve: (item: T) => void, reject: (err: unknown) => void])[]>()

  get size(): number {
    return this.openIds.size
  }

  open(id: string): void {
    this.openIds.add(id)
  }

  isOpen(id: string): boolean {
    return this.openIds.has(id)
  }

  push(id: string, item: T): void {
    this.assertOpen(id)

    const pending = this.waiters.get(id)

    if (pending?.length) {
      pending.shift()![0](item)

      if (pending.length === 0) {
        this.waiters.delete(id)
      }
    }
    else {
      const items = this.queues.get(id)

      if (items) {
        items.push(item)
      }
      else {
        this.queues.set(id, [item])
      }
    }
  }

  async pull(id: string): Promise<T> {
    this.assertOpen(id)

    const items = this.queues.get(id)

    if (items?.length) {
      const item = items.shift()!

      if (items.length === 0) {
        this.queues.delete(id)
      }

      return item
    }

    return new Promise<T>((resolve, reject) => {
      const waitingPulls = this.waiters.get(id)

      const pending = [resolve, reject] as const

      if (waitingPulls) {
        waitingPulls.push(pending)
      }
      else {
        this.waiters.set(id, [pending])
      }
    })
  }

  close({ id, reason }: AsyncIdQueueCloseOptions = {}): void {
    if (id === undefined) {
      this.waiters.forEach((pendingPulls, id) => {
        const error = reason ?? new AbortError(`[AsyncIdQueue] Queue[${id}] was closed or aborted while waiting for pulling.`)
        pendingPulls.forEach(([, reject]) => reject(error))
      })

      this.waiters.clear()
      this.openIds.clear()
      this.queues.clear()
      return
    }

    const error = reason ?? new AbortError(`[AsyncIdQueue] Queue[${id}] was closed or aborted while waiting for pulling.`)
    this.waiters.get(id)?.forEach(([, reject]) => reject(error))

    this.waiters.delete(id)
    this.openIds.delete(id)
    this.queues.delete(id)
  }

  private assertOpen(id: string): void {
    if (!this.isOpen(id)) {
      throw new Error(`[AsyncIdQueue] Cannot access queue[${id}] because it is not open or aborted.`)
    }
  }
}
