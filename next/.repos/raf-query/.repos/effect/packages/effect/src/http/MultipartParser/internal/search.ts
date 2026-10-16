interface SearchState {
  readonly needle: Uint8Array
  readonly needleLength: number
  readonly indexes: Record<number, ReadonlyArray<number>>
  readonly firstByte: number

  previousChunk: Uint8Array | undefined
  previousChunkLength: number
  matchIndex: number
}

function makeState(needle_: string): SearchState {
  const needle = new TextEncoder().encode(needle_)
  const needleLength = needle.length

  const indexes: Record<number, Array<number>> = {}
  for (let i = 0; i < needleLength; i++) {
    const b = needle[i]
    if (indexes[b] === undefined) indexes[b] = []
    indexes[b].push(i)
  }

  return {
    needle,
    needleLength,
    indexes,
    firstByte: needle[0],
    previousChunk: undefined,
    previousChunkLength: 0,
    matchIndex: 0
  }
}

export function make(
  needle: string,
  callback: (index: number, chunk: Uint8Array) => void,
  seed?: Uint8Array,
  minimumChunkLength?: number
) {
  const state = makeState(needle)
  const minChunkLength = minimumChunkLength ?? state.needleLength
  if (seed !== undefined) {
    state.previousChunk = seed
    state.previousChunkLength = seed.length
  }

  function makeIndexOf(): (
    chunk: Uint8Array,
    needle: Uint8Array,
    fromIndex: number
  ) => number {
    // on node.js use the Buffer api
    if (
      "Buffer" in globalThis &&
      !("Bun" in globalThis || "Deno" in globalThis)
    ) {
      return function(chunk, needle, fromIndex) {
        return Buffer.prototype.indexOf.call(chunk, needle, fromIndex)
      }
    }

    const skipTable = new Uint8Array(256).fill(state.needle.length)
    for (let i = 0, lastIndex = state.needle.length - 1; i < lastIndex; ++i) {
      skipTable[state.needle[i]] = lastIndex - i
    }

    return function(chunk, needle, fromIndex) {
      const lengthTotal = chunk.length
      let i = fromIndex + state.needleLength - 1

      while (i < lengthTotal) {
        for (
          let j = state.needleLength - 1, k = i;
          j >= 0 && chunk[k] === needle[j];
          j--, k--
        ) {
          if (j === 0) return k
        }
        i += skipTable[chunk[i]]
      }

      return -1
    }
  }

  const indexOf = makeIndexOf()

  function write(chunk: Uint8Array): void {
    let chunkLength = chunk.length

    if (state.previousChunk !== undefined) {
      const newChunk = new Uint8Array(state.previousChunkLength + chunkLength)
      newChunk.set(state.previousChunk)
      newChunk.set(chunk, state.previousChunkLength)
      chunk = newChunk
      chunkLength = state.previousChunkLength + chunkLength
      state.previousChunk = undefined
    }

    let pos = 0
    while (pos < chunkLength) {
      const remaining = chunkLength - pos
      if (remaining < minChunkLength) {
        state.previousChunk = chunk.subarray(pos)
        state.previousChunkLength = remaining
        return
      }

      const match = indexOf(chunk, state.needle, pos)

      if (match > -1) {
        if (match > pos) {
          callback(state.matchIndex, chunk.subarray(pos, match))
        }
        state.matchIndex += 1
        pos = match + state.needleLength
        continue
      } else if (chunk[chunkLength - 1] in state.indexes) {
        const indexes = state.indexes[chunk[chunkLength - 1]]
        let earliestIndex = -1
        for (let i = 0, len = indexes.length; i < len; i++) {
          const index = indexes[i]
          if (
            chunk[chunkLength - 1 - index] === state.firstByte &&
            i > earliestIndex
          ) {
            earliestIndex = index
          }
        }
        if (earliestIndex === -1) {
          if (pos === 0) {
            callback(state.matchIndex, chunk)
          } else {
            callback(state.matchIndex, chunk.subarray(pos))
          }
        } else {
          if (chunkLength - 1 - earliestIndex > pos) {
            callback(
              state.matchIndex,
              chunk.subarray(pos, chunkLength - 1 - earliestIndex)
            )
          }
          state.previousChunk = chunk.subarray(chunkLength - 1 - earliestIndex)
          state.previousChunkLength = earliestIndex + 1
        }
      } else if (pos === 0) {
        callback(state.matchIndex, chunk)
      } else {
        callback(state.matchIndex, chunk.subarray(pos))
      }

      break
    }
  }

  function end(): void {
    if (state.previousChunk !== undefined && state.previousChunk !== seed) {
      callback(state.matchIndex, state.previousChunk)
    }

    state.previousChunk = seed
    state.previousChunkLength = seed?.length ?? 0
    state.matchIndex = 0
  }

  return { write, end } as const
}
