import { assert } from "@effect/vitest"
import { Aead, Digest, Mac, SecureRandom, Signature } from "effect/crypto"
import * as Base64Url from "effect/encoding/Base64Url"
import type { Jwk } from "effect/jose"
import * as JoseError from "effect/jose/JoseError"
import * as Layer from "effect/Layer"
import * as Result from "effect/Result"
import type * as Schema from "effect/Schema"

export const layer = Layer.mergeAll(
  Aead.layerWebCrypto,
  Digest.layerWebCrypto,
  Mac.layerWebCrypto,
  Signature.layerWebCrypto
).pipe(Layer.provideMerge(SecureRandom.layerWebCrypto))

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)
export const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)
export const base64url = (encoded: string): Uint8Array => Result.getOrThrow(Base64Url.decode(encoded))

export function assertReason<Tag extends JoseError.JoseErrorReason["_tag"]>(
  error: JoseError.JoseError | Schema.SchemaError,
  reason: Tag
): asserts error is JoseError.JoseError & {
  readonly reason: Extract<JoseError.JoseErrorReason, { readonly _tag: Tag }>
} {
  assert.isTrue(JoseError.isJoseError(error))
  assert.strictEqual((error as JoseError.JoseError).reason._tag, reason)
}

// RFC 7515, Appendix A. Every example signs the same payload.
export const rfc7515 = {
  payload: "eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ",
  // A.1
  hs256: {
    jwk: {
      kty: "oct",
      k: "AyM1SysPpbyDfgZld3umj1qzKObwVMkoqQ-EstJQLr_T-1qS0gZH75aKtMN3Yj0iPS4hcgUuTwjAzZr1Z9CAow"
    } satisfies Jwk.SecretJwk,
    token: "eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9" +
      ".eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ" +
      ".dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
  },
  // A.2
  rs256: {
    jwk: {
      kty: "RSA",
      n: "ofgWCuLjybRlzo0tZWJjNiuSfb4p4fAkd_wWJcyQoTbji9k0l8W26mPddxHmfHQp-Vaw-4qPCJrcS2mJPMEzP1Pt0Bm4d4QlL-yRT-SFd2lZS-pCgNMsD1W_YpRPEwOWvG6b32690r2jZ47soMZo9wGzjb_7OMg0LOL-bSf63kpaSHSXndS5z5rexMdbBYUsLA9e-KXBdQOS-UTo7WTBEMa2R2CapHg665xsmtdVMTBQY4uDZlxvb3qCo5ZwKh9kG4LT6_I5IhlJH7aGhyxXFvUK-DWNmoudF8NAco9_h9iaGNj8q2ethFkMLs91kzk2PAcDTW9gb54h4FRWyuXpoQ",
      e: "AQAB",
      d: "Eq5xpGnNCivDflJsRQBXHx1hdR1k6Ulwe2JZD50LpXyWPEAeP88vLNO97IjlA7_GQ5sLKMgvfTeXZx9SE-7YwVol2NXOoAJe46sui395IW_GO-pWJ1O0BkTGoVEn2bKVRUCgu-GjBVaYLU6f3l9kJfFNS3E0QbVdxzubSu3Mkqzjkn439X0M_V51gfpRLI9JYanrC4D4qAdGcopV_0ZHHzQlBjudU2QvXt4ehNYTCBr6XCLQUShb1juUO1ZdiYoFaFQT5Tw8bGUl_x_jTj3ccPDVZFD9pIuhLhBOneufuBiB4cS98l2SR_RQyGWSeWjnczT0QU91p1DhOVRuOopznQ",
      p: "4BzEEOtIpmVdVEZNCqS7baC4crd0pqnRH_5IB3jw3bcxGn6QLvnEtfdUdiYrqBdss1l58BQ3KhooKeQTa9AB0Hw_Py5PJdTJNPY8cQn7ouZ2KKDcmnPGBY5t7yLc1QlQ5xHdwW1VhvKn-nXqhJTBgIPgtldC-KDV5z-y2XDwGUc",
      q: "uQPEfgmVtjL0Uyyx88GZFF1fOunH3-7cepKmtH4pxhtCoHqpWmT8YAmZxaewHgHAjLYsp1ZSe7zFYHj7C6ul7TjeLQeZD_YwD66t62wDmpe_HlB-TnBA-njbglfIsRLtXlnDzQkv5dTltRJ11BKBBypeeF6689rjcJIDEz9RWdc",
      dp:
        "BwKfV3Akq5_MFZDFZCnW-wzl-CCo83WoZvnLQwCTeDv8uzluRSnm71I3QCLdhrqE2e9YkxvuxdBfpT_PI7Yz-FOKnu1R6HsJeDCjn12Sk3vmAktV2zb34MCdy7cpdTh_YVr7tss2u6vneTwrA86rZtu5Mbr1C1XsmvkxHQAdYo0",
      dq:
        "h_96-mK1R_7glhsum81dZxjTnYynPbZpHziZjeeHcXYsXaaMwkOlODsWa7I9xXDoRwbKgB719rrmI2oKr6N3Do9U0ajaHF-NKJnwgjMd2w9cjz3_-kyNlxAr2v4IKhGNpmM5iIgOS1VZnOZ68m6_pbLBSp3nssTdlqvd0tIiTHU",
      qi:
        "IYd7DHOhrWvxkwPQsRM2tOgrjbcrfvtQJipd-DlcxyVuuM9sQLdgjVk2oy26F0EmpScGLq2MowX7fhd_QJQ3ydy5cY7YIBi87w93IKLEdfnbJtoOPLUW0ITrJReOgo1cq9SbsxYawBgfp_gh6A5603k2-ZQwVK0JKSHuLFkuQ3U"
    } satisfies Jwk.PrivateJwk,
    token: "eyJhbGciOiJSUzI1NiJ9" +
      ".eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ" +
      ".cC4hiUPoj9Eetdgtv3hF80EGrhuB__dzERat0XF9g2VtQgr9PJbu3XOiZj5RZmh7AAuHIm4Bh-0Qc_lF5YKt_O8W2Fp5jujGbds9uJdbF9CUAr7t1dnZcAcQjbKBYNX4BAynRFdiuB--f_nZLgrnbyTyWzO75vRK5h6xBArLIARNPvkSjtQBMHlb1L07Qe7K0GarZRmB_eSN9383LcOLn6_dO--xi12jzDwusC-eOkHWEsqtFZESc6BfI7noOPqvhJ1phCnvWh6IeYI2w9QOYEUipUTI8np6LbgGY9Fs98rqVt5AXLIhWkWywlVmtVrBp0igcN_IoypGlUPQGe77Rw"
  },
  // A.3
  es256: {
    jwk: {
      kty: "EC",
      crv: "P-256",
      x: "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
      y: "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
      d: "jpsQnnGQmL-YBIffH1136cspYG6-0iY7X1fCE9-E9LI"
    } satisfies Jwk.PrivateJwk,
    token: "eyJhbGciOiJFUzI1NiJ9" +
      ".eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ" +
      ".DtEhU3ljbEg8L38VWAfUAqOyKAM6-Xx-F4GawxaepmXFCgfTjDxw5djxLa8ISlSApmWQxfKTUJqPP3-Kg6NU1Q"
  }
} as const

const { d: _rsaD, dp: _dp, dq: _dq, p: _p, q: _q, qi: _qi, ...rs256Public } = rfc7515.rs256.jwk
const { d: _ecD, ...es256Public } = rfc7515.es256.jwk

export const rs256PublicJwk: Jwk.PublicJwk = rs256Public
export const es256PublicJwk: Jwk.PublicJwk = es256Public

// 32 bytes, the only length `dir`/A256GCM accepts.
export const secret = new Uint8Array(32).fill(7)
export const secretJwk: Jwk.SecretJwk = { kty: "oct", k: Base64Url.encode(secret) }
