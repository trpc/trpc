import { assert, describe, it } from "@effect/vitest"
import * as Mime from "effect/http/Mime"
import * as Option from "effect/Option"

describe("Mime", () => {
  it("looks up common static file types", () => {
    assert.deepStrictEqual(Mime.getType("index.html"), Option.some("text/html"))
    assert.deepStrictEqual(Mime.getType("styles.css"), Option.some("text/css"))
    assert.deepStrictEqual(Mime.getType("app.js"), Option.some("text/javascript"))
    assert.deepStrictEqual(Mime.getType("image.png"), Option.some("image/png"))
    assert.deepStrictEqual(Mime.getType("document.pdf"), Option.some("application/pdf"))
    assert.deepStrictEqual(Mime.getType("font.woff2"), Option.some("font/woff2"))
  })

  it("looks up standard MIME types", () => {
    assert.deepStrictEqual(Mime.getType("feed.atom"), Option.some("application/atom+xml"))
    assert.deepStrictEqual(Mime.getType("archive.jar"), Option.some("application/java-archive"))
    assert.deepStrictEqual(Mime.getType("calendar.ics"), Option.some("text/calendar"))
    assert.deepStrictEqual(Mime.getType("model.glb"), Option.some("model/gltf-binary"))
  })

  it("returns none for unknown and missing extensions", () => {
    assert.deepStrictEqual(Mime.getType("file.unknown"), Option.none())
    assert.deepStrictEqual(Mime.getType("/directory/file"), Option.none())
  })

  it("handles extensions case-insensitively", () => {
    assert.deepStrictEqual(Mime.getType("/directory/INDEX.HTML"), Option.some("text/html"))
    assert.deepStrictEqual(Mime.getType("PHOTO.JpEg"), Option.some("image/jpeg"))
  })

  it("exposes reverse lookups at the module level", () => {
    assert.deepStrictEqual(Mime.getExtension("text/html; charset=utf-8"), Option.some("html"))
    assert.deepStrictEqual(Mime.getAllExtensions("text/html"), Option.some(new Set(["html", "htm", "shtml"])))
    assert.deepStrictEqual(
      Mime.getAllExtensions("text/html; charset=utf-8"),
      Option.some(new Set(["html", "htm", "shtml"]))
    )
  })
})
