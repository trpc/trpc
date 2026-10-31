import { Effect, Layer, ManagedRuntime, Redacted, Schema } from "effect"
import { Aead, Mac, SecureRandom, Signature } from "effect/crypto"
import { Jwk, Jwks, Jws, Jwt } from "effect/jose"
import { deepStrictEqual, strictEqual } from "node:assert"
import { writeFile } from "node:fs/promises"
import { arch, cpus, platform, release } from "node:os"
import { Bench } from "tinybench"

// Run from the repository root: node packages/effect/benchmark/jose.ts
// JOSE_BENCH_OUTPUT retains the full samples; time and warmup are milliseconds.
// JOSE_BENCH_CASE optionally selects task names containing the supplied text.
// For comparisons, use identical copies of this file in both revisions and
// alternate baseline/head process order for at least seven paired rounds.
// Compare totalTime / completed operations per process, including slow samples;
// individual Tinybench iterations are not independent process observations.
const milliseconds = (name: string, fallback: number): number => {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive`)
  return value
}

const time = milliseconds("JOSE_BENCH_TIME", 500)
const warmupTime = milliseconds("JOSE_BENCH_WARMUP", 150)
const Claims = Schema.Struct({
  iss: Schema.String,
  sub: Schema.String,
  aud: Schema.String,
  role: Schema.Literals(["member", "admin"]),
  exp: Schema.Number
})
const claims = {
  iss: "https://issuer.example",
  sub: "user_1",
  aud: "api",
  role: "member" as const,
  exp: 4102444800
}
const policy = { issuer: claims.iss, subject: claims.sub, audience: claims.aud, typ: "JWT" }
const secret = Redacted.make({ kty: "oct", k: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc" } as const)

// Public RSA key and signed payload from RFC 7515 Appendix A.2. No RSA
// generation or private-key import runs in the benchmark or its setup.
const rsa: Jwk.PublicJwk = {
  kty: "RSA",
  n: "ofgWCuLjybRlzo0tZWJjNiuSfb4p4fAkd_wWJcyQoTbji9k0l8W26mPddxHmfHQp-Vaw-4qPCJrcS2mJPMEzP1Pt0Bm4d4QlL-yRT-SFd2lZS-pCgNMsD1W_YpRPEwOWvG6b32690r2jZ47soMZo9wGzjb_7OMg0LOL-bSf63kpaSHSXndS5z5rexMdbBYUsLA9e-KXBdQOS-UTo7WTBEMa2R2CapHg665xsmtdVMTBQY4uDZlxvb3qCo5ZwKh9kG4LT6_I5IhlJH7aGhyxXFvUK-DWNmoudF8NAco9_h9iaGNj8q2ethFkMLs91kzk2PAcDTW9gb54h4FRWyuXpoQ",
  e: "AQAB"
}
const rsaToken = "eyJhbGciOiJSUzI1NiJ9" +
  ".eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ" +
  ".cC4hiUPoj9Eetdgtv3hF80EGrhuB__dzERat0XF9g2VtQgr9PJbu3XOiZj5RZmh7AAuHIm4Bh-0Qc_lF5YKt_O8W2Fp5jujGbds9uJdbF9CUAr7t1dnZcAcQjbKBYNX4BAynRFdiuB--f_nZLgrnbyTyWzO75vRK5h6xBArLIARNPvkSjtQBMHlb1L07Qe7K0GarZRmB_eSN9383LcOLn6_dO--xi12jzDwusC-eOkHWEsqtFZESc6BfI7noOPqvhJ1phCnvWh6IeYI2w9QOYEUipUTI8np6LbgGY9Fs98rqVt5AXLIhWkWywlVmtVrBp0igcN_IoypGlUPQGe77Rw"

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Aead.layerWebCrypto,
    Mac.layerWebCrypto,
    Signature.layerWebCrypto,
    Jwks.layerLocal({ keys: [rsa] })
  ).pipe(Layer.provideMerge(SecureRandom.layerWebCrypto))
)

try {
  const signingKey = await runtime.runPromise(Jwk.importSecret(secret, "HS256"))
  const encryptionKey = await runtime.runPromise(Jwk.importSecret(secret, "dir"))
  const encrypted = await runtime.runPromise(Jwt.encrypt(Claims, claims, encryptionKey, { typ: "JWT" }))
  const resolveEncryptionKey = () => Effect.succeed(encryptionKey)
  const signAndVerify = Effect.flatMap(
    Jwt.sign(Claims, claims, signingKey, { typ: "JWT" }),
    (token) => Jwt.verify(Claims, token, signingKey, policy)
  )
  const verifyWithKeySet = Jws.verifyWithKeySet(rsaToken, { algorithms: ["RS256"] })
  // A larger set where only the last key can verify the token.
  const largeKeySet = await runtime.runPromise(Jwks.makeLocal({
    keys: [...Array.from({ length: 63 }, (_, i) => ({ ...rsa, kid: `enc-${i}`, use: "enc" })), rsa]
  }))
  const verifyWithLargeKeySet = Effect.provideService(verifyWithKeySet, Jwks.Jwks, largeKeySet)
  const decrypt = Jwt.decrypt(Claims, encrypted, resolveEncryptionKey, policy)
  const importPublic = Jwk.importPublic(rsa, "RS256")

  const validate = async () => {
    deepStrictEqual((await runtime.runPromise(signAndVerify)).claims, claims)
    const verified = await runtime.runPromise(verifyWithKeySet)
    strictEqual(verified.protectedHeader.alg, "RS256")
    deepStrictEqual((await runtime.runPromise(verifyWithLargeKeySet)).payload, verified.payload)
    deepStrictEqual(JSON.parse(new TextDecoder().decode(verified.payload)), {
      iss: "joe",
      exp: 1300819380,
      "http://example.com/is_root": true
    })
    deepStrictEqual((await runtime.runPromise(decrypt)).claims, claims)
    const publicKey = await runtime.runPromise(importPublic)
    strictEqual(publicKey.algorithm, "RS256")
    deepStrictEqual(publicKey.jwk, rsa)
    // Verify using the imported key as well, so import validation proves the
    // resulting key is usable rather than only checking its metadata.
    deepStrictEqual((await runtime.runPromise(Jws.verify(rsaToken, publicKey))).payload, verified.payload)
  }
  await validate()

  const bench = new Bench({ time, warmupTime, retainSamples: true, throws: true })
  bench
    .add("Jwt.sign + verify HS256", () => runtime.runPromise(signAndVerify))
    .add("Jws.verifyWithKeySet RS256 cached", () => runtime.runPromise(verifyWithKeySet))
    .add("Jws.verifyWithKeySet RS256 cached, 64 keys", () => runtime.runPromise(verifyWithLargeKeySet))
    .add("Jwt.decrypt dir/A256GCM resolver", () => runtime.runPromise(decrypt))
    .add("Jwk.importPublic RS256", () => runtime.runPromise(importPublic))

  const caseFilter = process.env.JOSE_BENCH_CASE
  if (caseFilter) {
    for (const task of bench.tasks) {
      if (!task.name.includes(caseFilter)) bench.remove(task.name)
    }
    if (bench.tasks.length === 0) throw new Error(`No JOSE benchmark matches ${caseFilter}`)
  }

  await bench.run()
  await validate()
  const tasks = bench.tasks.map((task) => {
    if (task.result.state !== "completed") throw new Error(`${task.name}: ${task.result.state}`)
    return {
      name: task.name,
      completedOperations: task.runs,
      nsPerOperation: task.result.totalTime * 1_000_000 / task.runs,
      result: task.result
    }
  })
  const output = {
    recordedAt: new Date().toISOString(),
    label: process.env.JOSE_BENCH_LABEL ?? "local",
    environment: {
      node: process.version,
      platform: platform(),
      release: release(),
      arch: arch(),
      cpu: cpus()[0]?.model,
      cpuCount: cpus().length
    },
    settings: { time, warmupTime, caseFilter, concurrency: 1, state: "warm", validation: "before and after" },
    tasks
  }
  console.table(bench.table())
  if (process.env.JOSE_BENCH_OUTPUT) {
    await writeFile(process.env.JOSE_BENCH_OUTPUT, JSON.stringify(output, null, 2) + "\n")
  }
} finally {
  await runtime.dispose()
}
