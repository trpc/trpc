import { assert, describe, it } from "@effect/vitest"
import * as Yaml from "effect/encoding/Yaml"

describe("Yaml", () => {
  it("parses nested block and flow collections", () => {
    assert.deepStrictEqual(
      Yaml.parse(`
name: effect
enabled: true
ports: [3000, 3001]
database:
  host: localhost
  credentials:
    - user: root
      roles: [admin, writer]
    - user: guest
      roles: []
`),
      {
        name: "effect",
        enabled: true,
        ports: [3000, 3001],
        database: {
          host: "localhost",
          credentials: [
            { user: "root", roles: ["admin", "writer"] },
            { user: "guest", roles: [] }
          ]
        }
      }
    )
  })

  it("parses quoted and block scalars", () => {
    assert.deepStrictEqual(
      Yaml.parse(`
quoted: "line\\nvalue"
literal: |
  first
  second
folded: >-
  first
  second
`),
      {
        quoted: "line\nvalue",
        literal: "first\nsecond\n",
        folded: "first second"
      }
    )
  })

  it("preserves paragraph and indentation breaks in folded block scalars", () => {
    assert.deepStrictEqual(
      Yaml.parse(`
paragraph: >-
  first

  second
indented: >-
  first
    second
  third
`),
      {
        paragraph: "first\nsecond",
        indented: "first\n  second\nthird"
      }
    )
  })

  it.each([
    [
      "leading blanks before a more-indented first line",
      "message: >-2\n\n    first\n  second\n",
      "\n  first\nsecond"
    ],
    [
      "keep chomping after a more-indented final line",
      "message: >+2\n  first\n    second\n",
      "first\n  second\n"
    ],
    [
      "multiple blank paragraph lines",
      "message: >-\n  first\n\n\n  second\n",
      "first\n\nsecond"
    ]
  ])("preserves %s", (_, source, expected) => {
    assert.deepStrictEqual(Yaml.parse(source), { message: expected })
  })

  it("resolves aliases", () => {
    assert.deepStrictEqual(
      Yaml.parse(`
defaults: &defaults
  host: localhost
  port: 5432
development:
  settings: *defaults
`),
      {
        defaults: { host: "localhost", port: 5432 },
        development: { settings: { host: "localhost", port: 5432 } }
      }
    )
  })

  it("rejects invalid indentation", () => {
    assert.throws(() => Yaml.parse("root:\n   child: true\n  sibling: false\n"))
  })

  // YAML 1.2.2 §8.2.1: a mapping value's block sequence may be indentless.
  describe("indentless sequences", () => {
    it.each([
      {
        name: "top-level mapping value",
        source: "allowed-tools:\n- Read\n- Bash\n",
        expected: { "allowed-tools": ["Read", "Bash"] }
      },
      {
        name: "nested mapping value",
        source: "metadata:\n  tools:\n  - Read\n",
        expected: { metadata: { tools: ["Read"] } }
      },
      {
        name: "multiple sequences and sibling keys",
        source: "tools:\n- Read\n- Bash\nroles:\n- admin\nenabled: true\n",
        expected: { tools: ["Read", "Bash"], roles: ["admin"], enabled: true }
      },
      {
        name: "comments and blank lines before and between items",
        source: "tools: # key comment\n# before sequence\n\n- Read # item comment\n  # between items\n\n- Bash\n",
        expected: { tools: ["Read", "Bash"] }
      },
      {
        name: "nested mapping items and their indentless sequences",
        source: "steps:\n- name: deploy\n  tools:\n  - Read\n  - Bash\n  enabled: true\n- name: verify\n",
        expected: { steps: [{ name: "deploy", tools: ["Read", "Bash"], enabled: true }, { name: "verify" }] }
      },
      {
        name: "nested sequences ending at mapping boundaries",
        source: "metadata:\n  tools:\n  - Read\n  roles:\n  - admin\n  enabled: true\nname: deploy\n",
        expected: { metadata: { tools: ["Read"], roles: ["admin"], enabled: true }, name: "deploy" }
      },
      {
        name: "multiline descriptions alongside sequences",
        source:
          "description: Deploy the service\n  and verify it.\ntools:\n- Read\nmetadata:\n  description: 'Check\n    the logs'\n  tools:\n  - Bash\n",
        expected: {
          description: "Deploy the service and verify it.",
          tools: ["Read"],
          metadata: { description: "Check the logs", tools: ["Bash"] }
        }
      }
    ])("parses $name", ({ source, expected }) => {
      assert.deepStrictEqual(Yaml.parse(source), expected)
    })
  })

  // YAML 1.2.2 §§6.5–6.7 and 7.3.1–7.3.3: flow scalar folding and comments.
  // Expected values and rejection fixtures were checked with yaml 2.9.1.
  describe("multiline flow scalars", () => {
    it.each([
      [
        "plain scalar starting below the key",
        "description:\n  Deploy the service\n  and verify it.\n",
        "Deploy the service and verify it."
      ],
      [
        "plain scalar starting on the key line",
        "description: Deploy the service\n  and verify it.\n",
        "Deploy the service and verify it."
      ],
      [
        "varying continuation indentation",
        "description:\n    Deploy\n  the service\n      and verify it.\n",
        "Deploy the service and verify it."
      ],
      ["one blank line", "description: Deploy\n\n  and verify.\n", "Deploy\nand verify."],
      ["multiple blank lines", "description: Deploy\n\n\n  and verify.\n", "Deploy\n\nand verify."],
      ["whitespace-only blank line", "description: Deploy\n   \n  and verify.\n", "Deploy\nand verify."],
      [
        "leading and trailing comments",
        "# before key\ndescription: # before value\n  # before scalar\n  Deploy\n  and verify. # after scalar\n# after value\n",
        "Deploy and verify."
      ],
      ["trailing whitespace", "description: Deploy  \n    and verify.  \n", "Deploy and verify."],
      ["CRLF line breaks", "description: Deploy\r\n  and verify.\r\n", "Deploy and verify."],
      ["double-quoted scalar", "description: \"Deploy it\n  and more\"\n", "Deploy it and more"],
      ["single-quoted scalar", "description: 'Deploy it\n  and more'\n", "Deploy it and more"],
      ["single-quoted apostrophe", "description: 'Deploy it\n  and don''t stop'\n", "Deploy it and don't stop"],
      ["double-quoted blank lines", "description: \"Deploy\n\n\n  and verify.\"\n", "Deploy\n\nand verify."],
      ["single-quoted blank line", "description: 'Deploy\n\n  and verify.'\n", "Deploy\nand verify."],
      ["quoted whitespace folding", "description: \"Deploy  \n    and verify.\"\n", "Deploy and verify."],
      ["double-quoted escaped line break", "description: \"De\\\n  ploy\"\n", "Deploy"],
      ["space before escaped line break", "description: \"Deploy \\\n  it\"\n", "Deploy it"],
      ["escaped line break followed by blank line", "description: \"Deploy\\\n\n  it\"\n", "Deploy it"],
      ["space before escaped line break followed by blank line", "description: \"Deploy \\\n\n  it\"\n", "Deploy  it"],
      ["escaped leading space after line break", "description: \"Deploy\\\n  \\ it\"\n", "Deploy it"],
      ["escaped trailing space before a folded break", "description: \"Deploy\\ \n  it\"\n", "Deploy  it"],
      ["escaped break followed by multiple blank lines", "description: \"Deploy\\\n\n\n  it\"\n", "Deploy\nit"],
      ["hash inside double quotes", "description: \"Deploy\n  # still text\" # comment\n", "Deploy # still text"],
      ["hash inside single quotes", "description: 'Deploy\n  # still text' # comment\n", "Deploy # still text"],
      [
        "colon and hash without separating spaces",
        "description: Visit https://example.com\n  for issue#123\n",
        "Visit https://example.com for issue#123"
      ],
      ["apostrophe in plain text before a comment", "description: Don't deploy # comment\n", "Don't deploy"],
      ["quote in plain text before a comment", "description: Use a \"quote # comment\n", "Use a \"quote"],
      ["single quote starting a plain continuation", "description: Deploy\n  'it # end\n", "Deploy 'it"],
      ["double quote starting a plain continuation", "description: Deploy\n  \"it # end\n", "Deploy \"it"],
      ["bracket and quote inside plain text", "description: plain [ a 'quote # comment\n", "plain [ a 'quote"]
    ])("folds %s", (_, source, expected) => {
      assert.deepStrictEqual(Yaml.parse(source), { description: expected })
      const nested = source.split(/\r?\n/).map((line) => `  ${line}`).join("\n")
      assert.deepStrictEqual(Yaml.parse(`metadata:\n${nested}`), { metadata: { description: expected } })
    })

    it("ends plain scalars at sibling keys after terminating comments", () => {
      assert.deepStrictEqual(
        Yaml.parse("description: Deploy\n  and verify. # end\n# between keys\nenabled: true\n"),
        { description: "Deploy and verify.", enabled: true }
      )
    })

    it("folds plain sequence items", () => {
      assert.deepStrictEqual(Yaml.parse("- Deploy\n  and verify.\n- Finish\n"), ["Deploy and verify.", "Finish"])
    })
  })

  describe("scalar conformance boundaries", () => {
    it.each([
      ["colon followed by space", "description: Use when: deploy\n"],
      ["colon at end of plain scalar", "description: Deploy:\n"],
      ["colon followed by tab", "description: Use when:\tdeploy\n"],
      ["colon in a continuation", "description: Deploy\n  when: ready\n"],
      ["continuation after an inline comment", "description: Deploy # end\n  and verify.\n"],
      ["continuation after a comment line", "description: Deploy\n  # end\n  and verify.\n"],
      ["continuation after a trailing continuation comment", "description: Deploy\n  and verify # end\n  again\n"],
      ["continuation after a comment following a literal single quote", "description: Deploy\n  'it # end\n  again\n"],
      ["continuation after a comment following a literal double quote", "description: Deploy\n  \"it # end\n  again\n"],
      ["unterminated double quote", "description: \"Deploy\n  and verify\n"],
      ["unterminated single quote", "description: 'Deploy\n  and verify\n"],
      ["content after closing double quote", "description: \"Deploy\n  it\" extra\n"],
      ["content after closing single quote", "description: 'Deploy\n  it' extra\n"],
      ["tab-indented scalar", "description:\n\tDeploy\n"],
      ["duplicate key", "description: first\ndescription: second\n"]
    ])("rejects %s", (_, source) => {
      assert.throws(() => Yaml.parse(source), SyntaxError)
    })

    it("preserves numeric decoding and quoted colon content", () => {
      assert.deepStrictEqual(
        Yaml.parse("description: 123\nquoted: 'Use when: deploy'\ntrailing: \"Deploy:\"\n"),
        { description: 123, quoted: "Use when: deploy", trailing: "Deploy:" }
      )
    })
  })

  describe("malformed content around compatibility shapes", () => {
    const shapes = [
      ["indentless sequence", "tools:\n- Read\n- Bash\n"],
      ["nested indentless sequence", "metadata:\n  tools:\n  - Read\n"],
      ["multiline plain scalar", "description: Deploy\n  and verify.\n"],
      ["multiline quoted scalar", "description: \"Deploy\n  and verify.\"\n"]
    ]
    it.each([
      ["unterminated flow sequence", "broken: [one, two\n"],
      ["unterminated flow mapping", "broken: {one: two\n"],
      ["unmatched top-level line", "broken: true\nunmatched\n"],
      ["tab indentation", "broken:\n\tchild: true\n"],
      ["invalid mapping indentation", "broken:\n   child: true\n  sibling: false\n"],
      ["duplicate keys", "broken: one\nbroken: two\n"]
    ])("rejects %s alone and before or after valid shapes", (_, malformed) => {
      assert.throws(() => Yaml.parse(malformed), SyntaxError)
      for (const [name, source] of shapes) {
        assert.throws(() => Yaml.parse(malformed + source), SyntaxError, undefined, `before ${name}`)
        assert.throws(() => Yaml.parse(source + malformed), SyntaxError, undefined, `after ${name}`)
      }
    })
  })

  describe("unsupported compact nested block sequences", () => {
    // Valid YAML, deliberately rejected as unsupported.
    it.each([
      ["indentless mapping value", "a:\n- - 1\n  - 2\n"],
      ["indented mapping value", "a:\n  - - 1\n    - 2\n"],
      ["root sequence", "- - 1\n  - 2\n"],
      ["blank line between nested entries", "- - 1\n\n  - 2\n"],
      ["nested entry after a scalar item", "a:\n- 1\n- - 2\n"],
      ["nested mapping item", "a:\n- - b: 1\n"],
      ["single-line nested sequence", "- - 1\n"],
      ["empty nested entry", "- -\n"]
    ])("rejects %s", (_, source) => {
      assert.throws(() => Yaml.parse(source), SyntaxError)
    })

    it.each(
      [
        ["mapping value", "a: one\n  - two\n", { a: "one - two" }],
        ["sequence item", "- one\n  - two\n", ["one - two"]]
      ] as const
    )("preserves a dash in a plain continuation of a %s", (_, source, expected) => {
      assert.deepStrictEqual(Yaml.parse(source), expected)
    })
  })

  describe("document boundaries", () => {
    // YAML 1.2.2 §9.1.2: document markers must start at column zero.
    it.each([
      ["---", ""],
      ["---", " # comment"],
      ["...", ""],
      ["...", " # comment"]
    ])("preserves indented %s%s as a mapping value", (marker, suffix) => {
      assert.deepStrictEqual(Yaml.parse(`a:\n  ${marker}${suffix}\n`), { a: marker })
      assert.deepStrictEqual(Yaml.parse(`metadata:\n  a:\n    ${marker}${suffix}\n`), { metadata: { a: marker } })
    })

    it.each([
      ["mappings", "a: 1\n---\nb: 2\n"],
      ["sequences", "- one\n---\n- two\n"],
      ["plain scalars", "one\n---\ntwo\n"],
      ["explicit initial marker", "---\na: 1\n--- # second document\nb: 2\n"],
      ["empty first document", "---\n---\nb: 2\n"],
      ["empty trailing document", "a: 1\n---\n"]
    ])("rejects a document stream containing %s", (_, source) => {
      assert.throws(() => Yaml.parse(source), SyntaxError)
    })

    it.each(
      [
        ["mapping", "# before\n--- # start\na: 1\n... # end\n# after\n", { a: 1 }],
        ["sequence", "---\n- one\n- two\n...\n", ["one", "two"]],
        ["plain scalar", "---\none\n...\n", "one"],
        ["empty document", "---\n...\n", null]
      ] as const
    )("preserves single-document markers around a %s", (_, source, expected) => {
      assert.deepStrictEqual(Yaml.parse(source), expected)
    })
  })

  describe("anchors and quoted comment boundaries", () => {
    it.each([
      ["plain", "description: &text Deploy\n  and verify.\nalias: *text\n", "Deploy and verify."],
      [
        "single-quoted",
        "description: &text 'Deploy # first\n  # second' # end\nalias: *text\n",
        "Deploy # first # second"
      ],
      [
        "double-quoted",
        "description: &text \"Deploy # first\n  # second\" # end\nalias: *text\n",
        "Deploy # first # second"
      ]
    ])("resolves anchored multiline %s scalars", (_, source, expected) => {
      assert.deepStrictEqual(Yaml.parse(source), { description: expected, alias: expected })
    })

    it("resolves anchored nested indentless sequences", () => {
      assert.deepStrictEqual(
        Yaml.parse("metadata:\n  tools: &tools\n  - Read\n  - Bash\n  alias: *tools\n"),
        { metadata: { tools: ["Read", "Bash"], alias: ["Read", "Bash"] } }
      )
    })

    it("preserves hashes in JSON-style flow strings without colon spacing", () => {
      assert.deepStrictEqual(Yaml.parse("{\"description\":\"Deploy # now\"} # end\n"), { description: "Deploy # now" })
    })

    it("preserves hashes in single- and double-quoted flow sequence items", () => {
      assert.deepStrictEqual(
        Yaml.parse("descriptions: [\"Deploy # now\", 'Verify # later'] # end\n"),
        { descriptions: ["Deploy # now", "Verify # later"] }
      )
    })
  })
})
