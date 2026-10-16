import { decodeBase64url, encodeBase64url } from './base64url'

const ALGORITHM = { name: 'HMAC', hash: 'SHA-256' }

/**
 * Signs a string value using HMAC-SHA256 with a secret key.
 *
 * This function creates a cryptographic signature that can be used to verify
 * the integrity and authenticity of the data. The signature is appended to
 * the original value, separated by a dot, using base64url encoding (no padding).
 *
 * @example
 * ```ts
 * const signedValue = await sign("user123", "my-secret-key")
 * expect(signedValue).toEqual("user123.oneQsU0r5dvwQFHFEjjV1uOI_IR3gZfkYHij3TRauVA")
 * ```
 *
 * @see {@link https://orpc.dev/docs/helpers/signing | Signing Helpers}
 */
export async function sign(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    ALGORITHM,
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign(
    ALGORITHM,
    key,
    encoder.encode(value),
  )

  return `${value}.${encodeBase64url(new Uint8Array(signature))}`
}

/**
 * Verifies and extracts the original value from a signed string.
 *
 * This function validates the signature of a previously signed value using the same
 * secret key. If the signature is valid, it returns the original value. If the
 * signature is invalid or the format is incorrect, it returns undefined.
 *
 * @example
 * ```ts
 * const signedValue = "user123.oneQsU0r5dvwQFHFEjjV1uOI_IR3gZfkYHij3TRauVA"
 * const originalValue = await unsign(signedValue, "my-secret-key")
 * expect(originalValue).toEqual("user123")
 * ```
 *
 * @see {@link https://orpc.dev/docs/helpers/signing | Signing Helpers}
 */
export async function unsign(signedValue: string | undefined | null, secret: string): Promise<string | undefined> {
  if (typeof signedValue !== 'string') {
    return undefined
  }

  const lastDotIndex = signedValue.lastIndexOf('.')
  if (lastDotIndex === -1) {
    return undefined
  }

  const value = signedValue.slice(0, lastDotIndex)
  const signatureBase64url = signedValue.slice(lastDotIndex + 1)
  const signature = decodeBase64url(signatureBase64url)

  if (signature === undefined) {
    return undefined
  }

  const encoder = new TextEncoder()

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    ALGORITHM,
    false,
    ['verify'],
  )

  const isValid = await crypto.subtle.verify(
    ALGORITHM,
    key,
    signature,
    encoder.encode(value),
  )

  return isValid ? value : undefined
}

/**
 * Extracts the value part from a signed string without verification.
 *
 * This function simply extracts the original value from a signed string
 * without performing any signature verification. It's useful when you need
 * to access the value quickly without the overhead of cryptographic verification.
 *
 * @example
 * ```ts
 * const signedValue = "user123.oneQsU0r5dvwQFHFEjjV1uOI_IR3gZfkYHij3TRauVA"
 * const value = getSignedValue(signedValue)
 * expect(value).toEqual("user123")
 * ```
 *
 * @see {@link https://orpc.dev/docs/helpers/signing | Signing Helpers}
 */
export function getSignedValue(signedValue: string | undefined | null): string | undefined {
  if (typeof signedValue !== 'string') {
    return undefined
  }

  const lastDotIndex = signedValue.lastIndexOf('.')
  if (lastDotIndex === -1) {
    return undefined
  }

  return signedValue.slice(0, lastDotIndex)
}
