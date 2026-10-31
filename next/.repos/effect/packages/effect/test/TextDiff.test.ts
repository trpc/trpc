import { describe, it } from "@effect/vitest"
import { assertSuccess, assertTrue, deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import * as Result from "effect/Result"
import * as TextDiff from "effect/TextDiff"
import * as fc from "fast-check"

const cost = (edits: ReadonlyArray<TextDiff.Edit<unknown>>): number =>
  edits.reduce((n, edit) => edit._tag === "Equal" ? n : n + edit.items.length, 0)

const lcsLength = <A>(a: ReadonlyArray<A>, b: ReadonlyArray<A>): number => {
  let prev = new Array<number>(b.length + 1).fill(0)
  for (const x of a) {
    const next = [0]
    for (let j = 0; j < b.length; j++) {
      next.push(x === b[j] ? prev[j] + 1 : Math.max(prev[j + 1], next[j]))
    }
    prev = next
  }
  return prev[b.length]
}

const isCanonical = (edits: ReadonlyArray<TextDiff.Edit<unknown>>): boolean =>
  edits.every((edit, i) =>
    edit.items.length > 0 &&
    (i === 0 || (edits[i - 1]._tag !== edit._tag && !(edits[i - 1]._tag === "Insert" && edit._tag === "Delete")))
  )

const assertTextDiffFailure = <A>(result: Result.Result<A, TextDiff.TextDiffError>) => {
  assertTrue(Result.isFailure(result))
  assertTrue(TextDiff.isTextDiffError(result.failure))
}

const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

const smallArray = fc.array(fc.constantFrom("a", "b", "c"), { maxLength: 12 })
const text = fc.string({ unit: fc.constantFrom("a", "b", "\n", "\r\n", "é", "e\u0301", "😀", "👍🏽") })

describe("TextDiff", () => {
  describe("diff", () => {
    it("produces a canonical script that applies and inverts, minimal within maxEdits", () => {
      fc.assert(fc.property(smallArray, smallArray, fc.option(fc.nat(6)), (before, after, maxEdits) => {
        const edits = TextDiff.diff(before, after, maxEdits === null ? undefined : { maxEdits })
        assertSuccess(TextDiff.apply(before, edits), after)
        assertSuccess(TextDiff.apply(after, TextDiff.invert(edits)), before)
        deepStrictEqual(TextDiff.invert(TextDiff.invert(edits)), edits)
        assertTrue(isCanonical(edits))
        assertTrue(isCanonical(TextDiff.invert(edits)))
        const distance = before.length + after.length - 2 * lcsLength(before, after)
        if (maxEdits === null || distance <= maxEdits) {
          strictEqual(cost(edits), distance)
        }
      }))
    })

    it("charges maxEdits per region and never for common runs", () => {
      let calls = 0
      const diffCounted = TextDiff.diffWith<number>((a, b) => {
        calls++
        return a === b
      })
      const middle = Array.from({ length: 100_000 }, () => 1)
      const interleaved = Array.from({ length: 50_000 }, (_, i) => i)
      const cases: ReadonlyArray<readonly [ReadonlyArray<number>, ReadonlyArray<number>]> = [
        [[0, ...middle, 3], [2, ...middle, 4]],
        [interleaved, interleaved.map((i) => (i % 2 === 0 ? -i - 1 : i))]
      ]
      const maxEdits = 4
      for (const [before, after] of cases) {
        calls = 0
        const edits = diffCounted(before, after, { maxEdits })
        assertTrue(calls <= 2 * (before.length + after.length) * (maxEdits + 1))
        assertSuccess(TextDiff.apply(before, edits), after)
        assertTrue(isCanonical(edits))
      }
      deepStrictEqual(diffCounted(cases[0][0], cases[0][1], { maxEdits }), [
        { _tag: "Delete", items: [0] },
        { _tag: "Insert", items: [2] },
        { _tag: "Equal", items: middle },
        { _tag: "Delete", items: [3] },
        { _tag: "Insert", items: [4] }
      ])

      // A region over the cap becomes delete + insert without degrading the
      // small change after it
      const heavyBefore = Array.from({ length: 100 }, (_, i) => `a${i}\n`)
      const heavyAfter = Array.from({ length: 100 }, (_, i) => `b${i}\n`)
      const shared = Array.from({ length: 50 }, (_, i) => `s${i}\n`)
      deepStrictEqual(
        TextDiff.lines([...heavyBefore, ...shared, "x\n"].join(""), [...heavyAfter, ...shared, "y\n"].join(""), {
          maxEdits: 10
        }),
        [
          { _tag: "Delete", items: heavyBefore },
          { _tag: "Insert", items: heavyAfter },
          { _tag: "Equal", items: shared },
          { _tag: "Delete", items: ["x\n"] },
          { _tag: "Insert", items: ["y\n"] }
        ]
      )
    })
  })

  describe("diffWith", () => {
    it("matches with the equivalence and keeps items from before", () => {
      const diffById = TextDiff.diffWith<{ readonly id: number; readonly v: string }>((a, b) => a.id === b.id)
      deepStrictEqual(diffById([{ id: 1, v: "old" }, { id: 2, v: "x" }], [{ id: 1, v: "new" }]), [
        { _tag: "Equal", items: [{ id: 1, v: "old" }] },
        { _tag: "Delete", items: [{ id: 2, v: "x" }] }
      ])
    })
  })

  describe("apply", () => {
    it("fails when the script does not match the input length", () => {
      const edits = TextDiff.diff([1, 2], [1])
      assertTextDiffFailure(TextDiff.apply([1], edits))
      assertTextDiffFailure(TextDiff.apply([1, 2, 3], edits))
    })
  })

  describe("applyText", () => {
    it("fails when the script does not match the input content", () => {
      const edits = TextDiff.lines("a\nb\n", "a\n")
      assertTextDiffFailure(TextDiff.applyText("a\n", edits))
      assertTextDiffFailure(TextDiff.applyText("a\nb\nc\n", edits))
      assertTextDiffFailure(TextDiff.applyText("a\nc\n", edits))
      assertTextDiffFailure(TextDiff.applyText("c\nb\n", edits))
    })
  })

  describe("lines", () => {
    it("round-trips arbitrary text", () => {
      fc.assert(fc.property(text, text, (before, after) => {
        const edits = TextDiff.lines(before, after)
        assertSuccess(TextDiff.applyText(before, edits), after)
        assertSuccess(TextDiff.applyText(after, TextDiff.invert(edits)), before)
      }))
    })

    it("treats line terminators as content", () => {
      deepStrictEqual(TextDiff.lines("a\nb\n", "a\r\nb\n"), [
        { _tag: "Delete", items: ["a\n"] },
        { _tag: "Insert", items: ["a\r\n"] },
        { _tag: "Equal", items: ["b\n"] }
      ])
      deepStrictEqual(TextDiff.lines("a\nb", "a\nb\n"), [
        { _tag: "Equal", items: ["a\n"] },
        { _tag: "Delete", items: ["b"] },
        { _tag: "Insert", items: ["b\n"] }
      ])
    })
  })

  describe("codePoints", () => {
    it("round-trips arbitrary text without splitting surrogate pairs", () => {
      fc.assert(fc.property(text, text, (before, after) => {
        const edits = TextDiff.codePoints(before, after)
        assertSuccess(TextDiff.applyText(before, edits), after)
        for (const edit of edits) {
          assertTrue(!loneSurrogate.test(edit.items.join("")))
        }
      }))
    })

    it("splits combining marks from their base letter", () => {
      deepStrictEqual(TextDiff.codePoints("e\u0301", "e"), [
        { _tag: "Equal", items: ["e"] },
        { _tag: "Delete", items: ["\u0301"] }
      ])
    })
  })

  describe("unified", () => {
    const base = Array.from({ length: 20 }, (_, i) => `${i + 1}\n`).join("")
    const replace = (lines: Record<number, string | undefined>) =>
      Array.from({ length: 20 }, (_, i) => i + 1 in lines ? lines[i + 1] ?? "" : `${i + 1}\n`).join("")

    // Expected outputs are from `diff -u`, without its header lines
    it("matches diff -u", () => {
      const cases: ReadonlyArray<readonly [string, string, string]> = [
        [
          base,
          replace({ 3: "three\n", 17: "seventeen\n" }),
          "@@ -1,6 +1,6 @@\n 1\n 2\n-3\n+three\n 4\n 5\n 6\n@@ -14,7 +14,7 @@\n 14\n 15\n 16\n-17\n+seventeen\n 18\n 19\n 20\n"
        ],
        [
          base,
          replace({ 5: "five\n", 12: "twelve\n" }),
          "@@ -2,14 +2,14 @@\n 2\n 3\n 4\n-5\n+five\n 6\n 7\n 8\n 9\n 10\n 11\n-12\n+twelve\n 13\n 14\n 15\n"
        ],
        [
          base,
          replace({ 5: "five\n", 13: "thirteen\n" }),
          "@@ -2,7 +2,7 @@\n 2\n 3\n 4\n-5\n+five\n 6\n 7\n 8\n@@ -10,7 +10,7 @@\n 10\n 11\n 12\n-13\n+thirteen\n 14\n 15\n 16\n"
        ],
        [
          base,
          replace({ 1: undefined, 20: "20\n21\n" }),
          "@@ -1,4 +1,3 @@\n-1\n 2\n 3\n 4\n@@ -18,3 +17,4 @@\n 18\n 19\n 20\n+21\n"
        ],
        ["", "1\n2\n", "@@ -0,0 +1,2 @@\n+1\n+2\n"],
        ["1\n2\n", "", "@@ -1,2 +0,0 @@\n-1\n-2\n"],
        ["a\nb\n", "a\nb", "@@ -1,2 +1,2 @@\n a\n-b\n+b\n\\ No newline at end of file\n"],
        ["a\nb\n", "a\r\nb\n", "@@ -1,2 +1,2 @@\n-a\n+a\r\n b\n"],
        [base, base, ""]
      ]
      for (const [before, after, expected] of cases) {
        strictEqual(TextDiff.unified(TextDiff.lines(before, after)), expected)
      }
    })

    it("applies context and file names", () => {
      strictEqual(
        TextDiff.unified(TextDiff.lines("a\nb\nc\n", "a\nx\nc\n"), {
          context: 0,
          fromFile: "a/f.txt",
          toFile: "b/f.txt"
        }),
        "--- a/f.txt\n+++ b/f.txt\n@@ -2 +2 @@\n-b\n+x\n"
      )
    })
  })
})
