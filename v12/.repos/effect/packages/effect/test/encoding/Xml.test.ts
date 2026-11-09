import { assert, describe, it } from "@effect/vitest"
import { Channel, Effect, Ref, Result, Stream } from "effect"
import { Xml } from "effect/encoding"

const textEncoder = new TextEncoder()
const BOM = String.fromCharCode(0xFEFF)

const start = (name: string, attributes: Record<string, string> = {}): Xml.Event => ({
  _tag: "StartElement",
  name,
  attributes
})
const end = (name: string): Xml.Event => ({ _tag: "EndElement", name })
const text = (text: string): Xml.Event => ({ _tag: "Text", text })
const comment = (text: string): Xml.Event => ({ _tag: "Comment", text })
const pi = (target: string, data: string): Xml.Event => ({ _tag: "ProcessingInstruction", target, data })

const decodeString = (chunks: ReadonlyArray<string>, options?: Xml.DecodeOptions) =>
  Stream.fromIterable(chunks, { chunkSize: 1 }).pipe(
    Stream.pipeThroughChannel(Xml.decodeString(options)),
    Stream.runCollect
  )

const decodeBytes = (chunks: ReadonlyArray<Uint8Array>, options?: Xml.DecodeOptions) =>
  Stream.fromIterable(chunks, { chunkSize: 1 }).pipe(
    Stream.pipeThroughChannel(Xml.decode(options)),
    Stream.runCollect
  )

const encodeString = (events: ReadonlyArray<Xml.Event>) =>
  Stream.fromIterable(events).pipe(
    Stream.pipeThroughChannel(Xml.encodeString()),
    Stream.mkString
  )

const elements = (xml: string, path: ReadonlyArray<string>, options?: Xml.ElementsOptions) =>
  Stream.make(xml).pipe(
    Stream.pipeThroughChannel(Xml.decodeString()),
    Stream.pipeThroughChannel(Xml.elements(path, options)),
    Stream.runCollect
  )

const failure = <A>(effect: Effect.Effect<A, Xml.XmlError>) =>
  Effect.map(Effect.flip(effect), (error) => [error.kind, error.line, error.column])

const splits = (input: string): Array<Array<string>> => {
  const out: Array<Array<string>> = [input.split("")]
  for (let i = 0; i <= input.length; i++) out.push([input.slice(0, i), input.slice(i)])
  return out
}

const byteSplits = (bytes: Uint8Array): Array<Array<Uint8Array>> => {
  const out: Array<Array<Uint8Array>> = [Array.from(bytes, (byte) => Uint8Array.of(byte))]
  for (let i = 0; i <= bytes.length; i++) out.push([bytes.subarray(0, i), bytes.subarray(i)])
  return out
}

describe("Xml", () => {
  it("identifies Xml errors", () => {
    assert.isTrue(Xml.isXmlError(new Xml.XmlError({ kind: "Syntax", message: "boom" })))
    assert.isFalse(Xml.isXmlError({ _tag: "XmlError" }))
    assert.isFalse(Xml.isXmlError(null))
  })

  describe("decode", () => {
    it.effect("decodes documents split at every index with fresh state per run", () =>
      Effect.gen(function*() {
        const document = BOM + `<?xml version='1.1' encoding="UTF-8" standalone="no" ?>
<!-- prolog --><?a?>
<feed xmlns:e="urn:e" lang = 'en'>😀<br />
<e:item
  x="1"></e:item><!--inner--><?pi  data ?>
</feed>
<?xml-stylesheet d?>
`
        const expected: ReadonlyArray<Xml.Event> = [
          { _tag: "Declaration", version: "1.1", encoding: "UTF-8", standalone: false },
          comment(" prolog "),
          pi("a", ""),
          start("feed", { "xmlns:e": "urn:e", lang: "en" }),
          text("😀"),
          start("br"),
          end("br"),
          text("\n"),
          start("e:item", { x: "1" }),
          end("e:item"),
          comment("inner"),
          pi("pi", "data "),
          text("\n"),
          end("feed"),
          pi("xml-stylesheet", "d")
        ]
        for (const chunks of splits(document)) {
          assert.deepStrictEqual(yield* decodeString(chunks), expected)
        }
        const channel = Xml.decodeString()
        const run = (xml: string) => Stream.make(xml).pipe(Stream.pipeThroughChannel(channel), Stream.runCollect)
        assert.deepStrictEqual(yield* run("<a/>"), [start("a"), end("a")])
        assert.deepStrictEqual(yield* run("<b/>"), [start("b"), end("b")])
      }))

    it.effect("does not expose inherited attribute values", () =>
      Effect.gen(function*() {
        const events = yield* decodeString(["<a><b id='1'/><c __proto__='literal' constructor='own'/></a>"])
        const attributes = events.filter((event) => event._tag === "StartElement").map((event) => event.attributes)
        for (const absent of attributes.slice(0, 2)) {
          assert.isUndefined(absent["constructor"])
          assert.isUndefined(absent["toString"])
          assert.isUndefined(absent["__proto__"])
        }
        assert.strictEqual(attributes[2]["__proto__"], "literal")
        assert.strictEqual(attributes[2]["constructor"], "own")
      }))

    it.effect("decodes character data and attribute values", () =>
      Effect.gen(function*() {
        // Text and CDATA sections merge until the next markup, and "&", CR and "]]>" in an attribute value do not
        // affect the text around it
        const xml = "<a>p<b c=\"x\ty\r\nz&#10;&#9;&quot;]]>\" __proto__='&apos;\"'/>" +
          "&lt;&gt;&amp;&apos;&quot;&#65;&#x42;\r\n\r&#13;<![CDATA[<y>&amp;\r]]]]>\r\nz<!--c--><![CDATA[]]></a>"
        for (const chunks of splits(xml)) {
          assert.deepStrictEqual(yield* decodeString(chunks), [
            start("a"),
            text("p"),
            start("b", Object.fromEntries([["c", "x y z\n\t\"]]>"], ["__proto__", "'\""]])),
            end("b"),
            text("<>&'\"AB\n\n\r<y>&amp;\n]]\nz"),
            comment("c"),
            end("a")
          ])
        }
      }))

    it.effect("decodes DOCTYPEs without expanding entities", () =>
      Effect.gen(function*() {
        const doctype = `<!DOCTYPE a PUBLIC " -//A//B  C " "a[1]>.dtd" [
<!ELEMENT a (#PCDATA|b)*><!ATTLIST a b CDATA 'x' c (y|z) #IMPLIED><!NOTATION n PUBLIC 'n'>
<!ENTITY e "]>"><!ENTITY f SYSTEM "file:///etc/passwd"><!ENTITY g "&e;&f;">
<!ENTITY % p '<!ENTITY q "">'>%p;<!-- ]> --><?p ]>?>]>`
        for (const chunks of splits(doctype + "<a/>")) {
          assert.deepStrictEqual(yield* decodeString(chunks), [
            { _tag: "Doctype", name: "a", publicId: "-//A//B C", systemId: "a[1]>.dtd" },
            start("a"),
            end("a")
          ])
        }
        // References to declared entities, such as external or nested ones, fail instead of being expanded
        assert.deepStrictEqual(yield* failure(decodeString([doctype + "\n<a>&g;</a>"])), ["Unsupported", 5, 4])
        assert.deepStrictEqual(yield* decodeString(["<!DOCTYPE r SYSTEM 'r.dtd'><r/>"]), [
          { _tag: "Doctype", name: "r", systemId: "r.dtd" },
          start("r"),
          end("r")
        ])
        for (const chunks of splits("<!DOCTYPE a [text]><a/>")) {
          assert.deepStrictEqual(yield* decodeString(chunks), [
            { _tag: "Doctype", name: "a" },
            start("a"),
            end("a")
          ])
        }
        for (const chunks of splits("<!DOCTYPE a [>]><a/>")) {
          assert.deepStrictEqual(yield* failure(decodeString(chunks)), ["Syntax", 1, 14])
        }
      }))

    it.effect("decodes UTF-8 bytes", () =>
      Effect.gen(function*() {
        const bytes = textEncoder.encode(BOM + "<名前 é=\"日本\">😀 &#x1F600;</名前>")
        for (const chunks of byteSplits(bytes)) {
          assert.deepStrictEqual(yield* decodeBytes(chunks), [
            start("名前", { "é": "日本" }),
            text("😀 😀"),
            end("名前")
          ])
        }
        // Invalid UTF-8 and invalid characters, with columns in UTF-16 code units
        const invalid: ReadonlyArray<readonly [Uint8Array, number, number]> = [
          [Uint8Array.of(0xFE), 1, 1],
          [Uint8Array.of(0xFF), 1, 1],
          [Uint8Array.of(0xFE, 0x00), 1, 1],
          [Uint8Array.of(0xFF, 0x00), 1, 1],
          [Uint8Array.of(0x3C, 0x31, 0xFF, ...textEncoder.encode("></a>")), 1, 2],
          [Uint8Array.of(0x3C, 0x31, 0xE2), 1, 2],
          [Uint8Array.of(...textEncoder.encode("<a>\né"), 0xFF, ...textEncoder.encode("</a>")), 2, 2],
          [Uint8Array.of(...textEncoder.encode("<a>"), 0xED, 0xA0, 0x80, ...textEncoder.encode("</a>")), 1, 4],
          [textEncoder.encode("<a/>€").subarray(0, -1), 1, 5],
          [textEncoder.encode("<a>é日本" + String.fromCharCode(0xFFFE) + "</a>"), 1, 7],
          [textEncoder.encode("<a>😀" + String.fromCharCode(1) + "</a>"), 1, 6]
        ]
        for (const [input, line, column] of invalid) {
          for (const chunks of byteSplits(input)) {
            assert.deepStrictEqual(yield* failure(decodeBytes(chunks)), ["Syntax", line, column])
          }
        }
        // Byte input accepts only UTF-8 and US-ASCII encoding declarations
        const latin1 = "<?xml version=\"1.0\" encoding=\"ISO-8859-1\"?><a/>"
        assert.deepStrictEqual(yield* failure(decodeBytes([textEncoder.encode(latin1)])), ["Unsupported", 1, 1])
        assert.deepStrictEqual((yield* decodeString([latin1]))[0], {
          _tag: "Declaration",
          version: "1.0",
          encoding: "ISO-8859-1"
        })
      }))

    it.effect("rejects UTF-16 byte order marks as unsupported across chunk boundaries", () =>
      Effect.gen(function*() {
        for (
          const bytes of [
            Uint8Array.of(0xFF, 0xFE, 0x3C, 0, 0x61, 0, 0x2F, 0, 0x3E, 0),
            Uint8Array.of(0xFE, 0xFF, 0, 0x3C, 0, 0x61, 0, 0x2F, 0, 0x3E)
          ]
        ) {
          for (const chunks of byteSplits(bytes)) {
            assert.deepStrictEqual(yield* failure(decodeBytes(chunks)), ["Unsupported", 1, 1])
          }
        }
      }))

    it.effect("decodes ASCII bytes under a US-ASCII declaration", () =>
      Effect.gen(function*() {
        const bytes = textEncoder.encode(
          "<?xml version=\"1.0\" encoding=\"US-ASCII\"?><a>ASCII &#233;</a>"
        )
        for (const chunks of [[bytes], ...byteSplits(bytes)]) {
          assert.deepStrictEqual(yield* decodeBytes(chunks), [
            { _tag: "Declaration", version: "1.0", encoding: "US-ASCII" },
            start("a"),
            text("ASCII é"),
            end("a")
          ])
        }
      }))

    for (const chunked of [false, true]) {
      it.effect(`rejects non-ASCII bytes under a US-ASCII declaration (${chunked ? "chunked" : "whole"})`, () =>
        Effect.gen(function*() {
          const bytes = textEncoder.encode(
            "<?xml version=\"1.0\" encoding=\"US-ASCII\"?><a>é</a>"
          )
          for (const chunks of chunked ? byteSplits(bytes) : [[bytes]]) {
            const error = yield* Effect.flip(decodeBytes(chunks))
            assert.strictEqual(error.kind, "Syntax")
          }
        }))
    }

    it.effect("fails on malformed documents with positions", () =>
      Effect.gen(function*() {
        const cases: ReadonlyArray<readonly [string, Xml.XmlError["kind"], number, number]> = [
          ["", "Syntax", 1, 1],
          ["<a>", "Syntax", 1, 4],
          ["<a>\n<b>\r\n\r\r</c>", "Syntax", 5, 1],
          ["<a/><b/>", "Syntax", 1, 5],
          ["<a b='1' b='2'/>", "Syntax", 1, 10],
          ["<1a/>", "Syntax", 1, 2],
          ["<a>]]></a>", "Syntax", 1, 4],
          ["<a>&#xD800;</a>", "Syntax", 1, 4],
          ["<a>&unknown;</a>", "Syntax", 1, 4],
          ["<a><!-- a -- b --></a>", "Syntax", 1, 11]
        ]
        for (const [xml, kind, line, column] of cases) {
          for (const chunks of splits(xml)) {
            assert.deepStrictEqual(yield* failure(decodeString(chunks)), [kind, line, column], JSON.stringify(chunks))
          }
        }
        // Events completed before an error are emitted first
        for (const chunks of splits("<a><b/>text</c>")) {
          const results = yield* Stream.fromIterable(chunks, { chunkSize: 1 }).pipe(
            Stream.pipeThroughChannel(Xml.decodeString()),
            Stream.result,
            Stream.map(Result.match({ onFailure: (error) => error.kind, onSuccess: (event) => event._tag })),
            Stream.runCollect
          )
          assert.deepStrictEqual(results, ["StartElement", "StartElement", "EndElement", "Syntax"])
        }
      }))

    it.effect("limits token size and nesting depth", () =>
      Effect.gen(function*() {
        const limits: ReadonlyArray<readonly [string, string, string]> = [
          ["<a>", "0123456789", "</a>"],
          ["<a>", "<![CDATA[0123456789]]>", "</a>"],
          ["", "<a b='0123456789'/>", ""],
          ["", "<!--0123456789-->", "<a/>"],
          ["", "<?pi 0123456789?>", "<a/>"],
          ["", "<!DOCTYPE a [<!ENTITY e 'x'>]>", "<a/>"]
        ]
        for (const [before, token, after] of limits) {
          for (const chunks of splits(before + token + after)) {
            assert.isTrue((yield* decodeString(chunks, { maxTokenSize: token.length })).length > 0)
            assert.deepStrictEqual(
              yield* failure(decodeString(chunks, { maxTokenSize: token.length - 1 })),
              ["Limit", 1, before.length + 1]
            )
          }
        }
        const nested = "<a><a><a/></a></a>"
        assert.strictEqual((yield* decodeString([nested], { maxDepth: 3 })).length, 6)
        assert.deepStrictEqual(yield* failure(decodeString([nested], { maxDepth: 2 })), ["Limit", 1, 7])
      }))

    it.effect("bounds aggregate open names and releases them on close", () =>
      Effect.gen(function*() {
        const xml = "<aaaa><bbbb><cccc></cccc><dddd></dddd></bbbb><eeee></eeee></aaaa>"
        for (const chunks of splits(xml)) {
          assert.strictEqual((yield* decodeString(chunks, { maxTokenSize: 12 })).length, 10)
        }
        const oversized = "<aaaa><bbbb><cccc><dddd></dddd></cccc></bbbb></aaaa>"
        for (const chunks of splits(oversized)) {
          const error = yield* Effect.flip(decodeString(chunks, { maxTokenSize: 12 }))
          assert.strictEqual(error.kind, "Limit")
        }
      }))

    it("rejects invalid options at construction", () => {
      for (const value of [0, Number.NaN]) {
        assert.throws(() => Xml.decodeString({ maxTokenSize: value }))
        assert.throws(() => Xml.decode({ maxDepth: value }))
        assert.throws(() => Xml.elements(["a"], { maxElementSize: value }))
      }
      assert.throws(() => Xml.elements([]))
      assert.throws(() => Xml.elements(["a b"]))
    })
  })

  describe("encode", () => {
    it.effect("delivers a complete start tag before pulling the next event", () =>
      Effect.gen(function*() {
        const pulls = yield* Ref.make(0)
        const output = yield* Stream.fromIterable([start("stream", { xmlns: "jabber:client" }), end("stream")], {
          chunkSize: 1
        }).pipe(
          Stream.tap(() => Ref.update(pulls, (n) => n + 1)),
          Stream.pipeThroughChannel(Xml.encodeString()),
          Stream.take(1),
          Stream.runCollect
        )
        assert.deepStrictEqual(output, ["<stream xmlns=\"jabber:client\">"])
        assert.strictEqual(yield* Ref.get(pulls), 1)
      }))

    it.effect("writes events as escaped XML", () =>
      Effect.gen(function*() {
        const empty = [start("a"), start("b"), end("b"), end("a")]
        assert.strictEqual(yield* encodeString(empty), "<a><b></b></a>")
        assert.deepStrictEqual(
          yield* Stream.fromIterable(empty, { chunkSize: 1 }).pipe(
            Stream.pipeThroughChannel(Xml.encodeString()),
            Stream.runCollect
          ),
          ["<a>", "<b>", "</b>", "</a>"]
        )
        const escaped = [start("a", { b: "<&>\"'\t\n\r" }), text("<&> ]]> \"' \t\n\r"), end("a")]
        const xml = "<a b=\"&lt;&amp;>&quot;'&#9;&#10;&#13;\">&lt;&amp;&gt; ]]&gt; \"' \t\n&#13;</a>"
        assert.strictEqual(yield* encodeString(escaped), xml)
        assert.deepStrictEqual(yield* decodeString([xml]), escaped)
        // Decoded documents round trip through bytes
        const document = "<?xml version=\"1.0\"?><!DOCTYPE feed SYSTEM \"feed.dtd\"><!--c-->" +
          "<feed xmlns:a=\"urn:a\" a:b='&lt;\"'><a:entry>x &amp; <![CDATA[<y>]]>\r\n</a:entry><e/><?p d?></feed>"
        const decoded = yield* decodeString([document])
        const bytes = yield* Stream.fromIterable(decoded).pipe(
          Stream.pipeThroughChannel(Xml.encode()),
          Stream.runCollect
        )
        assert.deepStrictEqual(yield* decodeBytes(bytes), decoded)
      }))

    it.effect("fails on events that do not form a document", () =>
      Effect.gen(function*() {
        const declaration: Xml.Event = { _tag: "Declaration", version: "1.0" }
        const doctype: Xml.Event = { _tag: "Doctype", name: "a" }
        const cases: ReadonlyArray<ReadonlyArray<Xml.Event>> = [
          [],
          [start("a")],
          [start("a"), end("b")],
          [end("a")],
          [start("a"), end("a"), start("b"), end("b")],
          [start("a"), end("a"), text("x")],
          [start("1a"), end("1a")],
          [start("a", { "b c": "" }), end("a")],
          [start("a"), text(String.fromCharCode(0)), end("a")],
          [start("a", { b: String.fromCharCode(0xFFFF) }), end("a")],
          [start("a"), comment("a--b"), end("a")],
          [start("a"), comment("a-"), end("a")],
          [start("a"), pi("xml", "x"), end("a")],
          [start("a"), pi("p", "?>"), end("a")],
          [start("a"), pi("p q", ""), end("a")],
          [comment(""), declaration, start("a"), end("a")],
          [{ _tag: "Declaration", version: "2.0" }, start("a"), end("a")],
          [{ _tag: "Declaration", version: "1.0", encoding: "UTF-8\"" }, start("a"), end("a")],
          [start("a"), end("a"), doctype],
          [doctype, doctype, start("a"), end("a")],
          [{ _tag: "Doctype", name: "a [" }, start("a"), end("a")],
          [{ _tag: "Doctype", name: "a", publicId: "p" }, start("a"), end("a")],
          [{ _tag: "Doctype", name: "a", publicId: "\"", systemId: "s" }, start("a"), end("a")],
          [{ _tag: "Doctype", name: "a", systemId: "'\"" }, start("a"), end("a")]
        ]
        for (const events of cases) {
          const error = yield* Effect.flip(encodeString(events))
          assert.strictEqual(error.kind, "InvalidEvent", JSON.stringify(events))
          assert.deepStrictEqual([error.line, error.column], [undefined, undefined])
        }
        // Byte output can only declare UTF-8; string output preserves other encoding labels
        for (const encoding of ["ISO-8859-1", "US-ASCII"]) {
          const events = Stream.make<ReadonlyArray<Xml.Event>>(
            { _tag: "Declaration", version: "1.0", encoding },
            start("a"),
            end("a")
          )
          assert.strictEqual(
            yield* events.pipe(Stream.pipeThroughChannel(Xml.encodeString()), Stream.mkString),
            `<?xml version="1.0" encoding="${encoding}"?><a></a>`
          )
          const result = yield* events.pipe(
            Stream.pipeThroughChannel(Xml.encode()),
            Stream.runDrain,
            Effect.match({ onFailure: (error) => error.kind, onSuccess: () => "success" })
          )
          assert.strictEqual(result, "InvalidEvent", encoding)
        }
        // Each input chunk is written as one string, and output written before an invalid event is emitted first
        const results = yield* Stream.make(start("a"), text("x"), end("b")).pipe(
          Stream.pipeThroughChannel(Xml.encodeString()),
          Stream.result,
          Stream.map(Result.match({ onFailure: (error) => error.kind, onSuccess: (xml) => xml })),
          Stream.runCollect
        )
        assert.deepStrictEqual(results, ["<a>x", "InvalidEvent"])
      }))
  })

  describe("elements", () => {
    it.effect("collects the elements at a path", () =>
      Effect.gen(function*() {
        const xml = "<a><item id='1'><item id='2'>x</item></item><b><item/></b> <item id='3'/></a>"
        assert.deepStrictEqual(yield* elements(xml, ["a", "item"]), [
          {
            name: "item",
            attributes: { id: "1" },
            children: [{ name: "item", attributes: { id: "2" }, children: ["x"] }]
          },
          { name: "item", attributes: { id: "3" }, children: [] }
        ])
        assert.deepStrictEqual((yield* elements(xml, ["a", "*", "item"])).map((element) => element.attributes), [
          { id: "2" },
          {}
        ])
      }))

    it.effect("fails on oversized elements and unbalanced events", () =>
      Effect.gen(function*() {
        // Sizes count names, attribute names and values, and text, and restart for each element
        const xml = "<a>" + "<b c='12'><d>3</d></b>".repeat(2) + "</a>"
        assert.strictEqual((yield* elements(xml, ["a", "b"], { maxElementSize: 6 })).length, 2)
        assert.strictEqual((yield* Effect.flip(elements(xml, ["a", "b"], { maxElementSize: 5 }))).kind, "Limit")
        // The collector also validates directly supplied events.
        const cases: ReadonlyArray<readonly [ReadonlyArray<Xml.Event>, Xml.XmlError["kind"]]> = [
          [[end("a")], "InvalidEvent"],
          [[start("a")], "InvalidEvent"]
        ]
        for (const [events, kind] of cases) {
          const error = yield* Stream.fromIterable(events).pipe(
            Stream.pipeThroughChannel(Xml.elements(["a"])),
            Stream.runDrain,
            Effect.flip
          )
          assert.strictEqual(error.kind, kind)
          assert.deepStrictEqual([error.line, error.column], [undefined, undefined])
        }
      }))
  })

  describe("channels", () => {
    it.effect("propagate upstream errors and done values", () =>
      Effect.gen(function*() {
        // An upstream error is not replaced by an error about the incomplete document
        const error = yield* Stream.make("<a><b>").pipe(
          Stream.concat(Stream.fail("upstream")),
          Stream.pipeThroughChannel(Xml.decodeString<string>()),
          Stream.runDrain,
          Effect.flip
        )
        assert.strictEqual(error, "upstream")
        const events = Channel.fromIteratorArray(function*(): Generator<Xml.Event, string> {
          yield* [start("a"), end("a")]
          return "done"
        })
        assert.strictEqual(yield* Channel.runDrain(Channel.pipeTo(events, Xml.encode())), "done")
      }))

    it.effect("emit elements before pulling the rest of the input", () =>
      Effect.gen(function*() {
        const pulls = yield* Ref.make(0)
        const item = yield* Stream.fromIterable(["<a>", "<item/>", "<item/>", "</a>"], { chunkSize: 1 }).pipe(
          Stream.tap(() => Ref.update(pulls, (n) => n + 1)),
          Stream.pipeThroughChannel(Xml.decodeString()),
          Stream.pipeThroughChannel(Xml.elements(["a", "item"])),
          Stream.take(1),
          Stream.runCollect
        )
        assert.deepStrictEqual(item, [{ name: "item", attributes: {}, children: [] }])
        assert.strictEqual(yield* Ref.get(pulls), 2)
      }))
  })
})
