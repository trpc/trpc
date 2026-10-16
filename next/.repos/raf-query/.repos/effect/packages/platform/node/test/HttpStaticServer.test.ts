import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodeHttpPlatform from "@effect/platform-node/NodeHttpPlatform"
import * as NodePathLayer from "@effect/platform-node/NodePath"
import { assert, describe, it } from "@effect/vitest"
import { HttpRouter, HttpStaticServer } from "effect/http"
import * as Layer from "effect/Layer"
import * as Fs from "node:fs"
import { copyFile, cp, mkdtemp, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import * as NodePath from "node:path"
import { fileURLToPath } from "node:url"
import { vi } from "vitest"

vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof Fs>()
  return { ...original, createReadStream: vi.fn(original.createReadStream) }
})

const fixturesRoot = fileURLToPath(new URL("./fixtures/http-static-server", import.meta.url))
const fixturesOutsideFile = fileURLToPath(new URL("./fixtures/http-static-server-outside.txt", import.meta.url))

const staticFilesLayer = Layer.mergeAll(
  NodePathLayer.layer,
  NodeFileSystem.layer,
  NodeHttpPlatform.layer
)

const makeHandler = (
  root: string,
  options: Omit<Parameters<typeof HttpStaticServer.make>[0], "root"> = {}
) =>
  HttpRouter.toWebHandler(
    HttpStaticServer.layer({
      root,
      ...options
    }).pipe(Layer.provideMerge(staticFilesLayer)),
    { disableLogger: true }
  )

const withStaticFiles = async (
  run: (context: {
    readonly handler: (request: Request) => Promise<Response>
    readonly root: string
    readonly outsideFile: string
  }) => Promise<void>,
  options: Omit<Parameters<typeof HttpStaticServer.make>[0], "root"> = {}
) => {
  const temporaryRoot = await mkdtemp(NodePath.join(tmpdir(), "effect-http-static-server-"))
  const root = NodePath.join(temporaryRoot, "root")
  const outsideFile = NodePath.join(temporaryRoot, NodePath.basename(fixturesOutsideFile))

  await Promise.all([
    cp(fixturesRoot, root, { recursive: true }),
    copyFile(fixturesOutsideFile, outsideFile)
  ])

  const { handler, dispose } = makeHandler(root, options)
  try {
    await run({ handler, root, outsideFile })
  } finally {
    await dispose()
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

describe("HttpStaticServer", { concurrent: false }, () => {
  it("serves files with expected content type and body", async () => {
    await withStaticFiles(async ({ handler }) => {
      const response = await handler(new Request("http://localhost/hello.txt"))
      assert.strictEqual(response.status, 200)
      assert.strictEqual(response.headers.get("content-type"), "text/plain; charset=utf-8")
      assert.strictEqual((await response.text()).trimEnd(), "hello static file")
    })
  })

  it("serves default index file for directory paths", async () => {
    await withStaticFiles(async ({ handler }) => {
      const response = await handler(new Request("http://localhost/guide"))
      assert.strictEqual(response.status, 200)
      assert.strictEqual(response.headers.get("content-type"), "text/html; charset=utf-8")
      assert.strictEqual((await response.text()).trimEnd(), "<html><body>guide index</body></html>")
    })
  })

  it("supports custom index file and disabled index fallback", async () => {
    await withStaticFiles(async ({ handler }) => {
      const response = await handler(new Request("http://localhost/custom"))
      assert.strictEqual(response.status, 200)
      assert.strictEqual((await response.text()).trimEnd(), "<html><body>custom home</body></html>")
    }, { index: "home.html" })

    await withStaticFiles(async ({ handler }) => {
      const response = await handler(new Request("http://localhost/custom"))
      assert.strictEqual(response.status, 404)
    }, { index: undefined })
  })

  it("returns 304 for If-None-Match exact, weak, and wildcard", async () => {
    await withStaticFiles(async ({ handler }) => {
      const warmup = await handler(new Request("http://localhost/conditional.txt"))
      const etag = warmup.headers.get("etag")
      assert.notStrictEqual(etag, null)
      if (etag === null) {
        throw new Error("missing etag")
      }
      const weakComparable = etag.startsWith("W/") ? etag.slice(2) : `W/${etag}`

      const exact = await handler(
        new Request("http://localhost/conditional.txt", { headers: { "If-None-Match": etag } })
      )
      const weak = await handler(
        new Request("http://localhost/conditional.txt", { headers: { "If-None-Match": weakComparable } })
      )
      const any = await handler(new Request("http://localhost/conditional.txt", { headers: { "If-None-Match": "*" } }))

      assert.deepStrictEqual([exact.status, weak.status, any.status], [304, 304, 304])
      assert.strictEqual(exact.headers.get("etag"), etag)
      assert.strictEqual(exact.headers.get("cache-control"), "public, max-age=60")
      assert.strictEqual(exact.headers.get("content-type"), null)
      assert.strictEqual(exact.headers.get("content-length"), null)
    }, { cacheControl: "public, max-age=60" })
  })

  it("returns 304 for If-Modified-Since and 200 when file changed", async () => {
    await withStaticFiles(async ({ handler, root }) => {
      const first = await handler(new Request("http://localhost/conditional.txt"))
      const lastModified = first.headers.get("last-modified")
      assert.notStrictEqual(lastModified, null)
      if (lastModified === null) {
        throw new Error("missing last-modified")
      }

      const notModified = await handler(
        new Request("http://localhost/conditional.txt", {
          headers: {
            "If-Modified-Since": lastModified
          }
        })
      )
      assert.strictEqual(notModified.status, 304)

      const conditionalFile = NodePath.join(root, "conditional.txt")
      await writeFile(conditionalFile, "updated conditional body")
      const updatedTime = new Date(Date.now() + 10_000)
      await utimes(conditionalFile, updatedTime, updatedTime)

      const modified = await handler(
        new Request("http://localhost/conditional.txt", {
          headers: {
            "If-Modified-Since": lastModified
          }
        })
      )
      assert.strictEqual(modified.status, 200)
      assert.strictEqual(await modified.text(), "updated conditional body")
    })
  })

  it("honors Range only for a matching strong If-Range ETag", async () => {
    await withStaticFiles(async ({ handler, root }) => {
      const first = await handler(new Request("http://localhost/range.txt"))
      const etag = first.headers.get("etag")!
      assert.strictEqual(etag.startsWith("W/"), false)
      const fullBody = await first.text()
      vi.mocked(Fs.createReadStream).mockClear()

      const matching = await handler(
        new Request("http://localhost/range.txt", {
          headers: { Range: "bytes=0-10", "If-Range": etag }
        })
      )
      assert.strictEqual(matching.status, 206)
      assert.strictEqual(matching.headers.get("content-range"), `bytes 0-10/${fullBody.length}`)
      assert.strictEqual(await matching.text(), "0123456789a")
      // Only the selected range acquires a source, not the discarded full response.
      assert.deepStrictEqual(vi.mocked(Fs.createReadStream).mock.calls, [[NodePath.join(root, "range.txt"), {
        start: 0,
        end: 10
      }]])

      // Weak tags and Last-Modified dates never match: filesystem metadata
      // cannot prove a date is a strong validator.
      for (const ifRange of [`W/${etag}`, first.headers.get("last-modified")!]) {
        const response = await handler(
          new Request("http://localhost/range.txt", {
            headers: { Range: "bytes=0-10", "If-Range": ifRange }
          })
        )
        assert.strictEqual(response.status, 200)
        assert.strictEqual(response.headers.get("content-range"), null)
        assert.strictEqual(await response.text(), fullBody)
      }
    })
  })

  it.each(["bytes=10-", "bytes=100-200"])(
    "returns the full changed file for a stale If-Range ETag with Range %s",
    async (range) => {
      await withStaticFiles(async ({ handler, root }) => {
        const first = await handler(new Request("http://localhost/range.txt"))
        const etag = first.headers.get("etag")!
        await first.text()
        const updatedBody = "NEW-NEW-NEW-NEW-NEW-NEW-"
        await writeFile(NodePath.join(root, "range.txt"), updatedBody)
        const resumed = await handler(
          new Request("http://localhost/range.txt", {
            headers: { Range: range, "If-Range": etag }
          })
        )
        assert.strictEqual(resumed.status, 200)
        assert.strictEqual(resumed.headers.get("content-range"), null)
        assert.strictEqual(resumed.headers.get("content-length"), String(updatedBody.length))
        assert.notStrictEqual(resumed.headers.get("etag"), etag)
        assert.strictEqual(await resumed.text(), updatedBody)
      })
    }
  )

  it("handles range requests for valid, invalid, and malformed headers", async () => {
    await withStaticFiles(async ({ handler }) => {
      const full = await handler(new Request("http://localhost/range.txt"))
      const etag = full.headers.get("etag")!
      const fullBody = await full.text()
      const fileSize = fullBody.length

      const first = await handler(new Request("http://localhost/range.txt", { headers: { Range: "bytes=0-10" } }))
      assert.strictEqual(first.status, 206)
      assert.strictEqual(first.headers.get("content-range"), `bytes 0-10/${fileSize}`)
      assert.strictEqual(await first.text(), "0123456789a")

      const openEnded = await handler(new Request("http://localhost/range.txt", { headers: { Range: "bytes=5-" } }))
      assert.strictEqual(openEnded.status, 206)
      assert.strictEqual(openEnded.headers.get("content-range"), `bytes 5-${fileSize - 1}/${fileSize}`)
      assert.strictEqual(await openEnded.text(), fullBody.slice(5))

      const suffix = await handler(new Request("http://localhost/range.txt", { headers: { Range: "bytes=-10" } }))
      assert.strictEqual(suffix.status, 206)
      assert.strictEqual(suffix.headers.get("content-range"), `bytes ${fileSize - 10}-${fileSize - 1}/${fileSize}`)
      assert.strictEqual(await suffix.text(), fullBody.slice(-10))

      vi.mocked(Fs.createReadStream).mockClear()
      const invalid = await handler(
        new Request("http://localhost/range.txt", {
          headers: { Range: "bytes=100-200", "If-Range": etag }
        })
      )
      assert.strictEqual(invalid.status, 416)
      assert.strictEqual(invalid.headers.get("content-range"), `bytes */${fileSize}`)
      assert.strictEqual(await invalid.text(), "")
      assert.deepStrictEqual(vi.mocked(Fs.createReadStream).mock.calls, [])

      const malformed = await handler(new Request("http://localhost/range.txt", { headers: { Range: "bytes=abc" } }))
      assert.strictEqual(malformed.status, 200)
      assert.strictEqual(await malformed.text(), fullBody)
    })
  })

  const unsafeRangeInteger = (BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1)).toString()

  it.each([
    `bytes=${unsafeRangeInteger}-`,
    `bytes=${unsafeRangeInteger}-${unsafeRangeInteger}`
  ])("returns 416 for a range start above Number.MAX_SAFE_INTEGER: %s", async (range) => {
    await withStaticFiles(async ({ handler }) => {
      const fullBody = await handler(new Request("http://localhost/range.txt")).then((response) => response.text())
      const response = await handler(
        new Request("http://localhost/range.txt", { headers: { Range: range } })
      )

      assert.strictEqual(response.status, 416)
      assert.strictEqual(response.headers.get("content-range"), `bytes */${fullBody.length}`)
      assert.strictEqual(await response.text(), "")
    })
  })

  it.each([
    `bytes=0-${unsafeRangeInteger}`,
    `bytes=-${unsafeRangeInteger}`
  ])("returns the whole file as 206 for range ends and suffixes above Number.MAX_SAFE_INTEGER: %s", async (range) => {
    await withStaticFiles(async ({ handler }) => {
      const fullBody = await handler(new Request("http://localhost/range.txt")).then((response) => response.text())
      const response = await handler(new Request("http://localhost/range.txt", { headers: { Range: range } }))

      assert.strictEqual(response.status, 206)
      assert.strictEqual(response.headers.get("content-range"), `bytes 0-${fullBody.length - 1}/${fullBody.length}`)
      assert.strictEqual(response.headers.get("content-length"), String(fullBody.length))
      assert.strictEqual(await response.text(), fullBody)
    })
  })

  it("clamps a range end above Number.MAX_SAFE_INTEGER while preserving a nonzero start", async () => {
    await withStaticFiles(async ({ handler }) => {
      const fullBody = await handler(new Request("http://localhost/range.txt")).then((response) => response.text())
      const response = await handler(
        new Request("http://localhost/range.txt", { headers: { Range: `bytes=5-${unsafeRangeInteger}` } })
      )

      assert.strictEqual(response.status, 206)
      assert.strictEqual(response.headers.get("content-range"), `bytes 5-${fullBody.length - 1}/${fullBody.length}`)
      assert.strictEqual(response.headers.get("content-length"), String(fullBody.length - 5))
      assert.strictEqual(await response.text(), fullBody.slice(5))
    })
  })

  it("handles SPA fallback for html accept and missing routes", async () => {
    await withStaticFiles(async ({ handler }) => {
      const htmlFallback = await handler(new Request("http://localhost/missing", { headers: { accept: "text/html" } }))
      assert.strictEqual(htmlFallback.status, 200)
      assert.strictEqual((await htmlFallback.text()).trimEnd(), "<html><body>root index</body></html>")

      const withExtension = await handler(
        new Request("http://localhost/missing.js", { headers: { accept: "text/html" } })
      )
      assert.strictEqual(withExtension.status, 404)

      const withoutHtmlAccept = await handler(
        new Request("http://localhost/missing", { headers: { accept: "application/json" } })
      )
      assert.strictEqual(withoutHtmlAccept.status, 404)
    }, { spa: true, index: "index.html" })
  })

  it("rejects directory traversal attempts", async () => {
    await withStaticFiles(async ({ handler, outsideFile }) => {
      const plainTraversal = await handler(new Request("http://localhost/../../../etc/passwd"))
      const encodedTraversal = await handler(new Request("http://localhost/..%2F..%2Fetc%2Fpasswd"))
      const encodedExistingParentFileTraversal = await handler(
        new Request(`http://localhost/..%2F${encodeURIComponent(NodePath.basename(outsideFile))}`)
      )

      assert.deepStrictEqual([
        plainTraversal.status,
        encodedTraversal.status,
        encodedExistingParentFileTraversal.status
      ], [
        404,
        404,
        404
      ])
    })
  })

  it("rejects null bytes and malformed uri encoding", async () => {
    await withStaticFiles(async ({ handler }) => {
      const nullByte = await handler(new Request("http://localhost/null%00byte.txt"))
      const malformed = await handler(new Request("http://localhost/%E0%A4%A"))

      assert.deepStrictEqual([nullByte.status, malformed.status], [404, 404])
    })
  })

  it("applies custom mime types and cache-control", async () => {
    await withStaticFiles(async ({ handler }) => {
      const response = await handler(new Request("http://localhost/hello.txt"))
      assert.strictEqual(response.status, 200)
      assert.strictEqual(response.headers.get("content-type"), "application/x-custom-text")
      assert.strictEqual(response.headers.get("cache-control"), "public, max-age=120")
    }, {
      cacheControl: "public, max-age=120",
      mimeTypes: {
        txt: "application/x-custom-text"
      }
    })
  })

  it("uses application/octet-stream for unknown extension and 404 for missing file", async () => {
    await withStaticFiles(async ({ handler }) => {
      const unknown = await handler(new Request("http://localhost/file.binx"))
      assert.strictEqual(unknown.status, 200)
      assert.strictEqual(unknown.headers.get("content-type"), "application/octet-stream")

      const missing = await handler(new Request("http://localhost/does-not-exist.txt"))
      assert.strictEqual(missing.status, 404)
    })
  })
})
