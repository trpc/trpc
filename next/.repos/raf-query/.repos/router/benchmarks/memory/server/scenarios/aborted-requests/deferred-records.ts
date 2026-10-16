const recordCount = 20

export type RecordGroup = 'alpha' | 'beta'

export interface DeferredRecord {
  id: string
  label: string
}

export function makeAbortedRequestRecords(
  id: string,
  group: RecordGroup,
): Array<DeferredRecord> {
  return Array.from({ length: recordCount }, (_, index) => ({
    id: `${group}-${id}-${index}`,
    label: `deferred-${group}-${id}-${index}`,
  }))
}

// Abort probes keep their deferred payload pending until the request is
// cancelled. Timer chains can outlive cancellation and spill into the next
// measured request; route-loader signals stop observing the request after load.
export function makeDeferredRecords(
  id: string,
  group: RecordGroup,
  signal: AbortSignal,
): Promise<Array<DeferredRecord>> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve([])
      return
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const onAbort = () => {
      clearTimeout(timeoutId)
      resolve([])
    }
    signal.addEventListener('abort', onAbort, { once: true })

    if (id === 'sanity-mid-stream' || id.startsWith('abort-')) {
      return
    }

    let remaining = group === 'alpha' ? 4 : 6
    const step = () => {
      remaining -= 1
      if (remaining === 0) {
        signal.removeEventListener('abort', onAbort)
        resolve(makeAbortedRequestRecords(id, group))
        return
      }
      timeoutId = setTimeout(step, 0)
    }
    timeoutId = setTimeout(step, 0)
  })
}
