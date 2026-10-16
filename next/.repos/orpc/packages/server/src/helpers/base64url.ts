/**
 * Encodes a Uint8Array to base64url format
 * Base64url is URL-safe and doesn't use padding
 *
 * @example
 * ```ts
 * const text = "Hello World"
 * const encoded = encodeBase64url(new TextEncoder().encode(text))
 * const decoded = decodeBase64url(encoded)
 * expect(new TextDecoder().decode(decoded)).toEqual(text)
 * ```
 *
 * @see {@link https://orpc.dev/docs/helpers/base64url | Base64Url Helpers}
 */
export function encodeBase64url(data: Uint8Array): string {
  const chunkSize = 8192 // 8KB chunks to stay well below call stack limits
  let binaryString = ''

  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.subarray(i, i + chunkSize)
    binaryString += String.fromCharCode(...chunk)
  }

  const base64 = btoa(binaryString)
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/**
 * Decodes a base64url string to Uint8Array
 * Only accepts canonical, unpadded base64url (the form produced by `encodeBase64url`),
 * returns undefined for anything else, including padded or standard base64 input
 *
 * @example
 * ```ts
 * const text = "Hello World"
 * const encoded = encodeBase64url(new TextEncoder().encode(text))
 * const decoded = decodeBase64url(encoded)
 * expect(new TextDecoder().decode(decoded)).toEqual(text)
 * ```
 *
 * @see {@link https://orpc.dev/docs/helpers/base64url | Base64Url Helpers}
 */
export function decodeBase64url(base64url: string | undefined | null): Uint8Array<ArrayBuffer> | undefined {
  try {
    if (typeof base64url !== 'string') {
      return undefined
    }

    let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')

    while (base64.length % 4) {
      base64 += '='
    }

    const binaryString = atob(base64)

    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    return encodeBase64url(bytes) === base64url ? bytes : undefined
  }
  catch {
    return undefined
  }
}
