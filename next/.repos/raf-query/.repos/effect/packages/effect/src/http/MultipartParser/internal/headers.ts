import type { Continue, FailureReason, ReturnValue } from "../HeadersParser.ts"

const constMaxPairs = 100
const constMaxSize = 16 * 1024

const State = {
  key: 0,
  whitespace: 1,
  value: 2
} as const
type State = (typeof State)[keyof typeof State]

const constContinue: Continue = { _tag: "Continue" }

// RFC 7230 token characters, allowed in header names
// The previous table stopped at byte 126; zero-filled entries for bytes 127-255
// preserve its rejection behavior because callers accept only entries equal to 1.
const constNameChars = new Uint8Array(256)
for (const char of "!#$%&'*+-.^_`|~0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ") {
  constNameChars[char.charCodeAt(0)] = 1
}

// HTAB, visible ASCII and obs-text, allowed in header values
const constValueChars = new Uint8Array(256)
constValueChars[9] = 1
for (let i = 32; i <= 126; i++) {
  constValueChars[i] = 1
}
for (let i = 128; i <= 255; i++) {
  constValueChars[i] = 1
}

export function make() {
  const decoder = new TextDecoder()
  const state = {
    state: State.key as State,
    headers: Object.create(null) as Record<string, string | Array<string>>,
    key: "",
    value: undefined as undefined | Uint8Array,
    crlf: 0,
    previousChunk: undefined as undefined | Uint8Array,
    pairs: 0,
    size: 0
  }

  function reset(value: ReturnValue): ReturnValue {
    state.state = State.key
    state.headers = Object.create(null)
    state.key = ""
    state.value = undefined
    state.crlf = 0
    state.previousChunk = undefined
    state.pairs = 0
    state.size = 0
    return value
  }

  function concatUint8Array(a: Uint8Array, b: Uint8Array): Uint8Array {
    const newUint8Array = new Uint8Array(a.length + b.length)
    newUint8Array.set(a)
    newUint8Array.set(b, a.length)
    return newUint8Array
  }

  function error(reason: FailureReason) {
    return reset({ _tag: "Failure", reason, headers: state.headers })
  }

  return function write(chunk: Uint8Array, start: number): ReturnValue {
    let endOffset = 0
    let previousCursor: number | undefined
    if (state.previousChunk !== undefined) {
      endOffset = state.previousChunk.length
      previousCursor = endOffset

      const newChunk = new Uint8Array(chunk.length + endOffset)
      newChunk.set(state.previousChunk)
      newChunk.set(chunk, endOffset)
      state.previousChunk = undefined
      chunk = newChunk
    }
    const end = chunk.length

    outer: while (start < end) {
      if (state.state === State.key) {
        let i = start
        for (; i < end; i++) {
          if (state.size++ > constMaxSize) {
            return error("HeaderTooLarge")
          }

          if (chunk[i] === 58) {
            state.key += decoder.decode(chunk.subarray(start, i)).toLowerCase()
            if (state.key.length === 0) {
              return error("InvalidHeaderName")
            }

            if (
              chunk[i + 1] === 32 &&
              chunk[i + 2] !== 32 &&
              chunk[i + 2] !== 9
            ) {
              start = i + 2
              state.state = State.value
              state.size++
            } else if (chunk[i + 1] !== 32 && chunk[i + 1] !== 9) {
              start = i + 1
              state.state = State.value
            } else {
              start = i + 1
              state.state = State.whitespace
            }

            break
          } else if (constNameChars[chunk[i]] !== 1) {
            return error("InvalidHeaderName")
          }
        }
        if (i === end) {
          state.key += decoder.decode(chunk.subarray(start, end)).toLowerCase()
          return constContinue
        }
      }

      if (state.state === State.whitespace) {
        for (; start < end; start++) {
          if (state.size++ > constMaxSize) {
            return error("HeaderTooLarge")
          }

          if (chunk[start] !== 32 && chunk[start] !== 9) {
            state.state = State.value
            break
          }
        }
        if (start === end) {
          return constContinue
        }
      }

      if (state.state === State.value) {
        let i = start
        if (previousCursor !== undefined) {
          i = previousCursor
          previousCursor = undefined
        }
        for (; i < end; i++) {
          if (state.size++ > constMaxSize) {
            return error("HeaderTooLarge")
          }

          if (chunk[i] === 13 || state.crlf > 0) {
            let byte = chunk[i]

            if (byte === 13 && state.crlf === 0) {
              state.crlf = 1
              i++
              state.size++
              byte = chunk[i]
            }
            if (byte === 10 && state.crlf === 1) {
              state.crlf = 2
              i++
              state.size++
              byte = chunk[i]
            }
            if (byte === 13 && state.crlf === 2) {
              state.crlf = 3
              i++
              state.size++
              byte = chunk[i]
            }
            if (byte === 10 && state.crlf === 3) {
              state.crlf = 4
              i++
              state.size++
            }

            if (state.crlf < 4 && i >= end) {
              state.previousChunk = chunk.subarray(start)
              return constContinue
            } else if (state.crlf >= 2) {
              state.value = state.value === undefined
                ? chunk.subarray(start, i - state.crlf)
                : concatUint8Array(
                  state.value,
                  chunk.subarray(start, i - state.crlf)
                )
              const value = decoder.decode(state.value)
              if (state.headers[state.key] === undefined) {
                state.headers[state.key] = value
              } else if (typeof state.headers[state.key] === "string") {
                state.headers[state.key] = [
                  state.headers[state.key] as string,
                  value
                ]
              } else {
                ;(state.headers[state.key] as Array<string>).push(value)
              }

              start = i
              state.size--

              if (state.crlf !== 4 && state.pairs === constMaxPairs) {
                return error("TooManyHeaders")
              } else if (state.crlf === 3) {
                return error("InvalidHeaderValue")
              } else if (state.crlf === 4) {
                return reset({
                  _tag: "Headers",
                  headers: state.headers,
                  endPosition: start - endOffset
                })
              }

              state.pairs++
              state.key = ""
              state.value = undefined
              state.crlf = 0
              state.state = State.key

              continue outer
            }
          } else if (constValueChars[chunk[i]] !== 1) {
            return error("InvalidHeaderValue")
          }
        }

        if (i === end) {
          state.value = state.value === undefined
            ? chunk.subarray(start, end)
            : concatUint8Array(state.value, chunk.subarray(start, end))
          return constContinue
        }
      }
    }

    if (start > end) {
      state.size += end - start
    }

    return constContinue
  }
}
