import { decodeBase64url, encodeBase64url } from './base64url'

const PBKDF2_CONFIG = {
  name: 'PBKDF2',
  iterations: 60_000, // Recommended minimum iterations per current OWASP guidelines
  hash: 'SHA-256',
} as const

const AES_GCM_CONFIG = {
  name: 'AES-GCM',
  length: 256,
} as const

const CRYPTO_CONSTANTS = {
  SALT_LENGTH: 16,
  IV_LENGTH: 12,
} as const

/**
 * Encrypts a string using AES-GCM with a secret key.
 * The output is base64url encoded to be URL-safe.
 *
 * @example
 * ```ts
 * const encrypted = await encrypt("Hello, World!", "test-secret-key")
 * const decrypted = await decrypt(encrypted, "test-secret-key")
 * expect(decrypted).toBe("Hello, World!")
 * ```
 *
 * @see {@link https://orpc.dev/docs/helpers/encryption | Encryption Helpers}
 */
export async function encrypt(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(value)

  const salt = crypto.getRandomValues(new Uint8Array(CRYPTO_CONSTANTS.SALT_LENGTH))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    PBKDF2_CONFIG.name,
    false,
    ['deriveKey'],
  )

  const key = await crypto.subtle.deriveKey(
    { ...PBKDF2_CONFIG, salt },
    keyMaterial,
    AES_GCM_CONFIG,
    false,
    ['encrypt'],
  )

  const iv = crypto.getRandomValues(new Uint8Array(CRYPTO_CONSTANTS.IV_LENGTH))

  const encrypted = await crypto.subtle.encrypt(
    { name: AES_GCM_CONFIG.name, iv },
    key,
    data,
  )

  const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength)
  result.set(salt, 0)
  result.set(iv, salt.length)
  result.set(new Uint8Array(encrypted), salt.length + iv.length)

  return encodeBase64url(result)
}

/**
 * Decrypts a base64url encoded string using AES-GCM with a secret key.
 * Returns the original string if decryption is successful, or undefined if it fails.
 *
 * @example
 * ```ts
 * const encrypted = await encrypt("Hello, World!", "test-secret-key")
 * const decrypted = await decrypt(encrypted, "test-secret-key")
 * expect(decrypted).toBe("Hello, World!")
 * ```
 *
 * @see {@link https://orpc.dev/docs/helpers/encryption | Encryption Helpers}
 */
export async function decrypt(encrypted: string | undefined | null, secret: string): Promise<string | undefined> {
  try {
    const data = decodeBase64url(encrypted)

    if (data === undefined) {
      return undefined
    }

    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const salt = data.slice(0, CRYPTO_CONSTANTS.SALT_LENGTH)
    const iv = data.slice(CRYPTO_CONSTANTS.SALT_LENGTH, CRYPTO_CONSTANTS.SALT_LENGTH + CRYPTO_CONSTANTS.IV_LENGTH)
    const encryptedData = data.slice(CRYPTO_CONSTANTS.SALT_LENGTH + CRYPTO_CONSTANTS.IV_LENGTH)

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      PBKDF2_CONFIG.name,
      false,
      ['deriveKey'],
    )

    const key = await crypto.subtle.deriveKey(
      { ...PBKDF2_CONFIG, salt },
      keyMaterial,
      AES_GCM_CONFIG,
      false,
      ['decrypt'],
    )

    const decrypted = await crypto.subtle.decrypt(
      { name: AES_GCM_CONFIG.name, iv },
      key,
      encryptedData,
    )

    return decoder.decode(decrypted)
  }
  catch {
    // Return undefined if decryption fails (invalid key, corrupted data, etc.)
    return undefined
  }
}
