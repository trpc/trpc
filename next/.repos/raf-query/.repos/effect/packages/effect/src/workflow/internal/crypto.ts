import * as Effect from "../../Effect.ts"

/**
 * @internal
 */
export const makeHashDigest = (original: string) =>
  Effect.map(
    Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(original))),
    (buffer) => {
      const data = new Uint8Array(buffer)
      let hexString = ""
      for (let i = 0; i < 16; i++) {
        hexString += data[i].toString(16).padStart(2, "0")
      }
      return hexString
    }
  )
