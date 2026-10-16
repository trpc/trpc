import { isAsyncIteratorObject } from '@standard-server/shared'

class Person {
  constructor(
    public name: string,
    public age: number,
  ) {}
}

export const handlers = {
  person: {
    condition: (value: unknown) => value instanceof Person,
    serialize: (person: Person) => ({ name: person.name, age: person.age }),
    deserialize: (data: { name: string, age: number }) => new Person(data.name, data.age),
  },
}

/** Mix of native types + custom Person class. */
function createUnit(i: number) {
  return {
    id: i,
    name: `item-${i}`,
    active: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    largeInt: 9007199254740993n + BigInt(i),
    tags: new Set(['a', 'b', 'c']),
    metadata: new Map<string, unknown>([
      ['version', '2.0.0'],
      ['count', i],
      ['nested', new Date('2023-06-15T12:30:00.000Z')],
    ]),
    homepage: new URL('https://orpc.dev/docs'),
    person: new Person(`person-${i}`, 20 + (i % 50)),
  }
}

const SIZE_5MB = 5 * 1024 * 1024

export const PAYLOAD_1KB = createUnit(0)
export const PAYLOAD_10KB = Array.from({ length: 10 }, (_, i) => createUnit(i))
export const PAYLOAD_100KB = Array.from({ length: 100 }, (_, i) => createUnit(i))
export const PAYLOAD_5MB = Array.from({ length: 5_000 }, (_, i) => createUnit(i))
// 3/10 JSON (native types + Person), 7/10 files
const FILE_BYTES = Math.floor(SIZE_5MB * 7 / 10 / 4)
export const PAYLOAD_5MB_WITH_FILES = {
  items: Array.from({ length: 1_500 }, (_, i) => createUnit(i)),
  files: [
    new File([new Uint8Array(FILE_BYTES)], 'a.bin'),
    new File([new Uint8Array(FILE_BYTES)], 'b.bin'),
    new File([new Uint8Array(FILE_BYTES)], 'c.bin'),
    new File([new Uint8Array(FILE_BYTES)], 'd.bin'),
  ],
}

export const EVENTS_1KB = [PAYLOAD_1KB]
export const EVENTS_10KB = Array.from({ length: 10 }).fill(PAYLOAD_1KB)
export const EVENTS_100KB = Array.from({ length: 50 }).fill([PAYLOAD_1KB, PAYLOAD_1KB])
export const EVENTS_5MB = Array.from({ length: 1000 }).fill([PAYLOAD_1KB, PAYLOAD_1KB, PAYLOAD_1KB, PAYLOAD_1KB, PAYLOAD_1KB])

/** Fresh async generator over prebuilt event parts (one-shot per call). */
export function asSyncIteratorObject(parts: readonly unknown[]): AsyncGenerator<unknown, void, undefined> {
  return (async function* () {
    for (const part of parts) {
      yield part
    }
  }())
}

export async function drainBody(body: unknown): Promise<void> {
  if (body === undefined || body === null) {
    return
  }

  if (isAsyncIteratorObject(body)) {
    const iterator = body as AsyncGenerator
    while (true) {
      const result = await iterator.next()
      if (result.done) {
        break
      }
    }
    return
  }

  if (body instanceof ReadableStream) {
    const reader = body.getReader()
    try {
      while (true) {
        const { done } = await reader.read()
        if (done) {
          break
        }
      }
    }
    finally {
      reader.releaseLock()
    }
  }
}
