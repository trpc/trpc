import { assert, describe, it } from "@effect/vitest"
import * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as McpServer from "effect/ai/McpServer"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Scheduler from "effect/Scheduler"
import { createHash } from "node:crypto"
import { initializeHttpSession, makeHttpHarness } from "./TestUtils/McpHttpHarness.ts"
import { readMcpHttpResponse } from "./TestUtils/McpHttpResponse.ts"
import { makeServerLayer } from "./TestUtils/McpServerLayer.ts"

// https://github.com/modelcontextprotocol/ext-skills/blob/main/specification/stable/skills.mdx

const modern = McpProtocol.v2026_07_28

const metadata = {
  "io.modelcontextprotocol/protocolVersion": modern.protocolVersion,
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "SkillsClient", version: "1.0.0" }
} as const

const modernRequest = (method: string, params: Record<string, unknown> = {}) => ({
  body: { jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: metadata } },
  headers: {
    "MCP-Protocol-Version": modern.protocolVersion,
    "Mcp-Method": method,
    ...(method === "resources/read" ? { "Mcp-Name": String(params.uri) } : {})
  }
})

const sha256 = (content: string | Uint8Array) => `sha256:${createHash("sha256").update(content).digest("hex")}`

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const skillMd = (frontmatter: string, body = "") => `---\n${frontmatter}\n---\n\n${body}`

const REFUNDS_SKILL_MD = skillMd(
  "name: refunds\n" +
    "description: Process refunds using the billing tools\n" +
    "license: Apache-2.0\n" +
    "metadata:\n" +
    "  acme-tools: issue_refund",
  "Read references/policy.md before issuing a refund.\n"
)

const Refunds = McpServer.skill({
  uri: "skill://acme/billing/refunds/SKILL.md",
  files: {
    "SKILL.md": REFUNDS_SKILL_MD,
    "references/policy.md": "Refunds above CHF 500 require manager approval.\n",
    "assets/logo.png": PNG,
    "scripts/check": { content: "#!/bin/sh\n", mimeType: "text/x-shellscript" }
  }
})

const Invoices = McpServer.skill({
  uri: "skill://acme/billing/invoices/SKILL.md",
  files: { "SKILL.md": skillMd("name: invoices\ndescription: Draft invoices", "Use the invoice tools.\n") }
})

const Skills = Layer.mergeAll(Refunds, Invoices)

const modernHarness = (registrations: Layer.Layer<never, unknown, McpServer.McpServer>) =>
  makeHttpHarness(
    registrations.pipe(Layer.provideMerge(makeServerLayer({ name: "SkillsServer", protocols: [modern] })))
  )

const call = Effect.fnUntraced(function*(
  harness: Effect.Success<ReturnType<typeof makeHttpHarness>>,
  method: string,
  params?: Record<string, unknown>,
  extraHeaders?: Record<string, string>
) {
  const { body, headers } = modernRequest(method, params)
  const response = yield* harness.post(body, { ...headers, ...extraHeaders })
  return { status: response.status, message: (yield* readMcpHttpResponse(response)) as any }
})

const readBytes = Effect.fnUntraced(
  function*(harness: Effect.Success<ReturnType<typeof makeHttpHarness>>, uri: string) {
    const { message } = yield* call(harness, "resources/read", { uri })
    const [content] = message.result.contents
    return content.text === undefined ? Buffer.from(content.blob, "base64") : Buffer.from(content.text, "utf8")
  }
)

describe("McpServer skills", () => {
  describe("v2026-07-28", () => {
    it.effect("declares the extension and the resources capability in discovery", () =>
      Effect.gen(function*() {
        const harness = yield* modernHarness(Skills)
        const { message } = yield* call(harness, "server/discover")
        assert.deepStrictEqual(message.result.capabilities.extensions, {
          "io.modelcontextprotocol/skills": { directoryRead: true }
        })
        assert.isDefined(message.result.capabilities.resources)
      }))

    it.effect("lists every skill with a manifest of the bytes resources/read serves", () =>
      Effect.gen(function*() {
        const harness = yield* modernHarness(Skills)
        const { message } = yield* call(harness, "skills/list")
        assert.strictEqual(message.result.resultType, "complete")
        assert.strictEqual(message.result.ttlMs, 0)
        assert.strictEqual(message.result.cacheScope, "private")

        const refunds = message.result.skills.find((skill: any) => skill.frontmatter.name === "refunds")
        assert.deepStrictEqual(refunds.uri, "skill://acme/billing/refunds/SKILL.md")
        assert.deepStrictEqual(refunds.frontmatter, {
          name: "refunds",
          description: "Process refunds using the billing tools",
          license: "Apache-2.0",
          metadata: { "acme-tools": "issue_refund" }
        })
        assert.deepStrictEqual(
          refunds.resources.map((resource: any) => resource.uri),
          [
            "skill://acme/billing/refunds/SKILL.md",
            "skill://acme/billing/refunds/assets/logo.png",
            "skill://acme/billing/refunds/references/policy.md",
            "skill://acme/billing/refunds/scripts/check"
          ]
        )

        for (const resource of refunds.resources) {
          const bytes = yield* readBytes(harness, resource.uri)
          assert.strictEqual(resource.digest, sha256(bytes))
          assert.strictEqual(resource.size, bytes.byteLength)
        }
        assert.strictEqual(
          (yield* readBytes(harness, "skill://acme/billing/refunds/SKILL.md")).toString("utf8"),
          REFUNDS_SKILL_MD
        )
      }))

    // Changing the caller's bytes after registration must not change what is served under the listed digest.
    // A Node `Buffer` is a `Uint8Array` whose `slice` shares memory, so it needs a real copy too.
    it.effect("serves the bytes given at registration after the caller changes them", () =>
      Effect.gen(function*() {
        const bytes = new Uint8Array(PNG)
        const buffer = Buffer.from(PNG)
        const wrapped = Buffer.from(PNG)
        const harness = yield* modernHarness(McpServer.skill({
          uri: "skill://logo/SKILL.md",
          files: {
            "SKILL.md": skillMd("name: logo\ndescription: Draw the logo"),
            "bytes.png": bytes,
            "buffer.png": buffer,
            "wrapped.png": { content: wrapped, mimeType: "image/png" }
          }
        }))
        for (const input of [bytes, buffer, wrapped]) input.fill(0)

        const { message } = yield* call(harness, "skills/get", { uri: "skill://logo/SKILL.md" })
        for (const name of ["bytes.png", "buffer.png", "wrapped.png"]) {
          const uri = `skill://logo/${name}`
          const listed = message.result.skill.resources.find((resource: any) => resource.uri === uri)
          assert.deepStrictEqual(new Uint8Array(yield* readBytes(harness, uri)), PNG, name)
          assert.strictEqual(listed.digest, sha256(PNG), name)
        }
      }))

    it.effect("gets a skill by the URI of its SKILL.md", () =>
      Effect.gen(function*() {
        const harness = yield* modernHarness(Skills)
        const { message: list } = yield* call(harness, "skills/list")
        const { message } = yield* call(harness, "skills/get", { uri: "skill://acme/billing/invoices/SKILL.md" })
        assert.strictEqual(message.result.resultType, "complete")
        assert.strictEqual(message.result.ttlMs, 0)
        assert.deepStrictEqual(
          message.result.skill,
          list.result.skills.find((skill: any) => skill.uri === "skill://acme/billing/invoices/SKILL.md")
        )
      }))

    // Directory children carry the same resource metadata as resources/list.
    it.effect("reads every directory of the skill namespace, merging shared prefixes", () =>
      Effect.gen(function*() {
        const harness = yield* modernHarness(Skills)
        const read = (uri: string) =>
          call(harness, "resources/directory/read", { uri }).pipe(Effect.map(({ message }) => message.result))
        const directory = (uri: string) => ({ uri, name: uri.split("/").at(-1), mimeType: "inode/directory" })
        const { message: list } = yield* call(harness, "resources/list")
        const listed = (uri: string) => list.result.resources.find((resource: any) => resource.uri === uri)

        assert.deepStrictEqual(listed("skill://acme/billing/refunds/SKILL.md"), {
          uri: "skill://acme/billing/refunds/SKILL.md",
          name: "refunds",
          description: "Process refunds using the billing tools",
          mimeType: "text/markdown",
          size: new TextEncoder().encode(REFUNDS_SKILL_MD).byteLength
        })

        const prefix = yield* read("skill://acme/billing")
        assert.strictEqual(prefix.resultType, "complete")
        assert.strictEqual(prefix.ttlMs, 0)
        assert.deepStrictEqual(prefix.resources, [
          directory("skill://acme/billing/invoices"),
          directory("skill://acme/billing/refunds")
        ])
        assert.deepStrictEqual((yield* read("skill://acme")).resources, [directory("skill://acme/billing")])
        assert.deepStrictEqual((yield* read("skill://acme/billing/refunds")).resources, [
          listed("skill://acme/billing/refunds/SKILL.md"),
          directory("skill://acme/billing/refunds/assets"),
          directory("skill://acme/billing/refunds/references"),
          directory("skill://acme/billing/refunds/scripts")
        ])
        assert.deepStrictEqual((yield* read("skill://acme/billing/refunds/assets")).resources, [
          listed("skill://acme/billing/refunds/assets/logo.png")
        ])
      }))

    it.effect("rejects unknown skills, non-directories and foreign cursors with -32602", () =>
      Effect.gen(function*() {
        const harness = yield* modernHarness(Skills)
        for (
          const [method, params] of [
            ["skills/get", { uri: "skill://acme/billing/missing/SKILL.md" }],
            ["skills/get", { uri: "skill://acme/billing/refunds/references/policy.md" }],
            ["resources/directory/read", { uri: "skill://acme/billing/refunds/SKILL.md" }],
            ["resources/directory/read", { uri: "skill://acme/missing" }],
            ["resources/directory/read", { uri: "skill://acme/billing/" }],
            ["skills/list", { cursor: "next" }]
          ] as const
        ) {
          const { message } = yield* call(harness, method, params)
          assert.strictEqual(message.error.code, -32602, `${method} ${JSON.stringify(params)}`)
        }
      }))

    it.effect("applies the skills cache hint to every skills result", () =>
      Effect.gen(function*() {
        const harness = yield* makeHttpHarness(Skills.pipe(Layer.provideMerge(makeServerLayer({
          name: "SkillsServer",
          protocols: [modern],
          cacheHints: { skills: { ttl: "1 minute", cacheScope: "private" } }
        }))))
        for (
          const [method, params] of [
            ["skills/list", {}],
            ["skills/get", { uri: "skill://acme/billing/refunds/SKILL.md" }],
            ["resources/directory/read", { uri: "skill://acme" }]
          ] as const
        ) {
          const { message } = yield* call(harness, method, params)
          assert.strictEqual(message.result.ttlMs, 60_000, method)
          assert.strictEqual(message.result.cacheScope, "private", method)
        }
      }))

    it.effect("answers the extension's methods with -32601 and omits the declaration without skills", () =>
      Effect.gen(function*() {
        const harness = yield* modernHarness(
          McpServer.resource({ uri: "file:///readme", name: "Readme", content: Effect.succeed("readme") })
        )
        const { message: discovered } = yield* call(harness, "server/discover")
        assert.isUndefined(discovered.result.capabilities.extensions)
        for (const method of ["skills/list", "skills/get", "resources/directory/read"]) {
          const { message, status } = yield* call(harness, method, { uri: "skill://acme" })
          assert.strictEqual(status, 404, method)
          assert.strictEqual(message.error.code, -32601, method)
        }
      }))
  })

  describe("sessionful revisions", () => {
    for (const protocol of [McpProtocol.v2025_11_25, McpProtocol.v2024_11_05]) {
      it.effect(`serves the extension without cache attributes on ${protocol.protocolVersion}`, () =>
        Effect.gen(function*() {
          const harness = yield* makeHttpHarness(Skills.pipe(Layer.provideMerge(makeServerLayer({
            name: "SkillsServer",
            protocols: [protocol],
            extensions: { "example/other": {} }
          }))))
          const initialize = yield* harness.post({
            jsonrpc: "2.0",
            id: "initialize",
            method: "initialize",
            params: {
              protocolVersion: protocol.protocolVersion,
              capabilities: {},
              clientInfo: { name: "test", version: "1.0.0" }
            }
          })
          const initialized = (yield* readMcpHttpResponse(initialize)) as any
          assert.deepStrictEqual(initialized.result.capabilities.extensions, {
            "example/other": {},
            "io.modelcontextprotocol/skills": { directoryRead: true }
          })

          const headers = yield* initializeHttpSession(harness, protocol)
          const post = (method: string, params: Record<string, unknown>) =>
            harness.post({ jsonrpc: "2.0", id: 2, method, params }, headers).pipe(
              Effect.flatMap(readMcpHttpResponse),
              Effect.map((message) => message as any)
            )

          const list = yield* post("skills/list", {})
          assert.deepStrictEqual(Object.keys(list.result), ["skills"])
          assert.strictEqual(list.result.skills.length, 2)

          const get = yield* post("skills/get", { uri: "skill://acme/billing/refunds/SKILL.md" })
          assert.deepStrictEqual(Object.keys(get.result), ["skill"])
          assert.strictEqual(get.result.skill.frontmatter.name, "refunds")

          const missing = yield* post("skills/get", { uri: "skill://acme/missing/SKILL.md" })
          assert.strictEqual(missing.error.code, -32602)

          const directory = yield* post("resources/directory/read", { uri: "skill://acme" })
          assert.deepStrictEqual(directory.result, {
            resources: [{ uri: "skill://acme/billing", name: "billing", mimeType: "inode/directory" }]
          })
        }))
    }
  })

  describe("visibility", () => {
    class CurrentUser extends Context.Service<CurrentUser, string>()("test/CurrentUser") {}

    const makeFixture = () => {
      const calls: Array<string> = []
      const Auth = McpServer.middleware<{ provides: CurrentUser }>()((effect, { headers, method, target }) => {
        calls.push(`${method} ${target}`)
        return Effect.provideService(effect, CurrentUser, headers["x-user"] ?? "guest")
      })
      const AdminOnly = McpServer.visibility(() => Effect.map(CurrentUser, (user) => user === "admin"))
      const registrations = Layer.mergeAll(
        McpServer.skill({
          uri: "skill://acme/public/SKILL.md",
          files: { "SKILL.md": skillMd("name: public\ndescription: Public skill", "Public.\n") }
        }),
        McpServer.skill({
          uri: "skill://acme/admin/SKILL.md",
          files: {
            "SKILL.md": skillMd("name: admin\ndescription: Admin skill", "Admin.\n"),
            "notes/secret.md": "Secret.\n"
          }
        }).pipe(Layer.provide(AdminOnly.combine(Auth).layer))
      )
      return { calls, registrations }
    }

    const admin = { "x-user": "admin" }

    it.effect("hides a skill from skills/list, skills/get, directory reads and file reads", () =>
      Effect.gen(function*() {
        const { registrations } = makeFixture()
        const harness = yield* modernHarness(registrations)
        const uris = (message: any) => message.result.skills.map((skill: any) => skill.uri)

        assert.deepStrictEqual(uris((yield* call(harness, "skills/list")).message), ["skill://acme/public/SKILL.md"])
        assert.deepStrictEqual(uris((yield* call(harness, "skills/list", {}, admin)).message), [
          "skill://acme/public/SKILL.md",
          "skill://acme/admin/SKILL.md"
        ])

        const hidden = yield* call(harness, "skills/get", { uri: "skill://acme/admin/SKILL.md" })
        assert.strictEqual(hidden.message.error.code, -32602)
        const shown = yield* call(harness, "skills/get", { uri: "skill://acme/admin/SKILL.md" }, admin)
        assert.strictEqual(shown.message.result.skill.frontmatter.name, "admin")

        const names = (message: any) => message.result.resources.map((child: any) => child.name)
        assert.deepStrictEqual(
          names((yield* call(harness, "resources/directory/read", { uri: "skill://acme" })).message),
          ["public"]
        )
        assert.deepStrictEqual(
          names((yield* call(harness, "resources/directory/read", { uri: "skill://acme" }, admin)).message),
          ["admin", "public"]
        )
        for (const uri of ["skill://acme/admin", "skill://acme/admin/notes"]) {
          const { message } = yield* call(harness, "resources/directory/read", { uri })
          assert.strictEqual(message.error.code, -32602, uri)
        }

        const read = yield* call(harness, "resources/read", { uri: "skill://acme/admin/notes/secret.md" })
        assert.strictEqual(read.message.error.code, -32602)
      }))

    it.effect("passes the SKILL.md URI as the target, checking only skills that have the directory", () =>
      Effect.gen(function*() {
        const { calls, registrations } = makeFixture()
        const harness = yield* modernHarness(registrations)
        yield* call(harness, "skills/list")
        yield* call(harness, "skills/get", { uri: "skill://acme/admin/SKILL.md" })
        yield* call(harness, "resources/directory/read", { uri: "skill://acme/public" })
        yield* call(harness, "resources/directory/read", { uri: "skill://acme/admin/notes" })
        assert.deepStrictEqual(calls, [
          "skills/list skill://acme/admin/SKILL.md",
          "skills/get skill://acme/admin/SKILL.md",
          "resources/directory/read skill://acme/admin/SKILL.md"
        ])
      }))
  })

  describe("registration", () => {
    const registerAll = (...registrations: ReadonlyArray<Effect.Effect<void, unknown, McpServer.McpServer>>) =>
      Effect.all(registrations, { discard: true }).pipe(Effect.provide(McpServer.McpServer.layer), Effect.exit)

    const register = (options: McpServer.SkillOptions) => registerAll(McpServer.registerSkill(options))

    const skill = (uri: string, frontmatter: string, files: Record<string, string> = {}): McpServer.SkillOptions => ({
      uri,
      files: { "SKILL.md": skillMd(frontmatter, "Refund carefully.\n"), ...files }
    })

    const refunds = (frontmatter = "name: refunds\ndescription: Process refunds", files?: Record<string, string>) =>
      skill("skill://refunds/SKILL.md", frontmatter, files)

    const assertRejected = (exit: Exit.Exit<void, unknown>, reason: RegExp) => {
      assert.isTrue(Exit.isFailure(exit))
      if (Exit.isFailure(exit)) assert.match(String(exit.cause), reason)
    }

    it.effect("accepts a valid skill, keeping frontmatter fields the Agent Skills specification does not define", () =>
      Effect.gen(function*() {
        assert.isTrue(
          Exit.isSuccess(yield* register(refunds("name: refunds\ndescription: Process refunds\nx-team: [billing]")))
        )
      }))

    it.effect("rejects a name that differs from the last path segment", () =>
      Effect.gen(function*() {
        assertRejected(
          yield* register(skill("skill://other/SKILL.md", "name: refunds\ndescription: Process refunds")),
          /frontmatter name "refunds" must equal "other"/
        )
      }))

    it.effect("rejects a URI that does not address a SKILL.md", () =>
      Effect.gen(function*() {
        assertRejected(
          yield* register(skill("skill://refunds/README.md", "name: refunds\ndescription: Process refunds")),
          /<skill-path>\/SKILL\.md/
        )
      }))

    it.effect("rejects frontmatter that breaks the Agent Skills specification", () =>
      Effect.gen(function*() {
        assertRejected(
          yield* register(skill("skill://Refunds/SKILL.md", "name: Refunds\ndescription: Process refunds")),
          /not valid Agent Skills frontmatter[\s\S]*\["name"\]/
        )
        for (
          const [frontmatter, reason] of [
            ["name: refunds\ndescription: \"\"", /\["description"\]/],
            // `metadata` is a map of strings.
            ["name: refunds\ndescription: Process refunds\nmetadata:\n  version: 2", /\["metadata"\]\["version"\]/],
            [`name: refunds\ndescription: Process refunds\ncompatibility: ${"x".repeat(501)}`, /\["compatibility"\]/]
          ] as const
        ) {
          assertRejected(yield* register(refunds(frontmatter)), reason)
        }
      }))

    it.effect("rejects a SKILL.md without frontmatter", () =>
      Effect.gen(function*() {
        assertRejected(
          yield* register({ uri: "skill://refunds/SKILL.md", files: { "SKILL.md": "Refund carefully.\n" } }),
          /must begin with YAML frontmatter/
        )
      }))

    it.effect("rejects a file path that escapes the skill", () =>
      Effect.gen(function*() {
        for (const path of ["../secrets.md", "references/../../secrets.md", "/etc/passwd", "references\\..\\x"]) {
          assertRejected(yield* register(refunds(undefined, { [path]: "secret" })), /escapes the skill/)
        }
      }))

    // Nesting is not supported: a skill inside another skill's directory would need the enclosing manifest to list it.
    it.effect("rejects a skill whose directory overlaps another skill's, in either order", () =>
      Effect.gen(function*() {
        const outer = refunds()
        const inner = skill("skill://refunds/nested/SKILL.md", "name: nested\ndescription: Nested")
        assertRejected(yield* registerAll(McpServer.registerSkill(outer), McpServer.registerSkill(inner)), /overlaps/)
        assertRejected(yield* registerAll(McpServer.registerSkill(inner), McpServer.registerSkill(outer)), /overlaps/)

        // Sharing a prefix is not overlapping.
        const sibling = skill("skill://refunds-v2/SKILL.md", "name: refunds-v2\ndescription: Process refunds")
        assert.isTrue(
          Exit.isSuccess(yield* registerAll(McpServer.registerSkill(outer), McpServer.registerSkill(sibling)))
        )
      }))

    // A plain resource replacing a skill file would serve bytes that no longer match the manifest.
    it.effect("rejects a plain resource sharing a URI with a skill file, in either order", () =>
      Effect.gen(function*() {
        const policy = McpServer.registerResource({
          uri: "skill://refunds/references/policy.md",
          name: "Policy",
          content: Effect.succeed("Replaced.\n")
        })
        const withPolicy = McpServer.registerSkill(refunds(undefined, { "references/policy.md": "Approve first.\n" }))
        assertRejected(yield* registerAll(withPolicy, policy), /skill:\/\/refunds\/references\/policy\.md/)
        assertRejected(yield* registerAll(policy, withPolicy), /skill:\/\/refunds\/references\/policy\.md/)
      }))

    // A plain resource registered concurrently can pass the ownership check and then be paused before it is
    // stored. A gated scheduler runs that registration one step at a time, so a skill can claim the URI in
    // that window. One of the two registrations must lose, and the public resources view must match the winner.
    it.effect("keeps a skill file and a concurrently registered resource from both succeeding", () =>
      Effect.gen(function*() {
        const uri = "skill://refunds/SKILL.md"
        const tasks: Array<() => void> = []
        const gated: Scheduler.Scheduler = {
          executionMode: "async",
          shouldYield: (fiber) => fiber.currentOpCount > 2,
          makeDispatcher: () => ({ scheduleTask: (task) => tasks.push(task), flush: () => {} })
        }
        const step = () => tasks.shift()?.()

        const server = yield* McpServer.McpServer
        const resourceFiber = yield* McpServer.registerResource({
          uri,
          name: "Replacement",
          content: Effect.succeed("Replaced.\n")
        }).pipe(Effect.provideService(Scheduler.Scheduler, gated), Effect.exit, Effect.forkChild)
        while (tasks.length === 0) yield* Effect.yieldNow
        // Step until the resource passed the ownership check, or its registration finished.
        while (tasks.length > 0 && !server.resources.some(({ resource }) => resource.uri === uri)) step()

        const skillExit = yield* Effect.exit(McpServer.registerSkill(refunds()))
        while (tasks.length > 0) step()
        const resourceExit = yield* Fiber.join(resourceFiber)

        assert.notStrictEqual(Exit.isSuccess(resourceExit), Exit.isSuccess(skillExit))
        const listed = server.resources.filter(({ resource }) => resource.uri === uri)
        assert.strictEqual(listed.length, 1)
        assert.strictEqual(listed[0].resource.name, Exit.isSuccess(skillExit) ? "refunds" : "Replacement")
        const served = yield* server.findResource(uri).pipe(
          Effect.provideService(
            McpSchema.McpServerClient,
            McpSchema.McpServerClient.of({
              clientId: 1,
              protocolVersion: "2025-06-18",
              clientCapabilities: {},
              clientInfo: { name: "test", version: "1.0.0" },
              initializePayload: {
                protocolVersion: "2025-06-18",
                capabilities: {},
                clientInfo: { name: "test", version: "1.0.0" }
              },
              getClient: Effect.die("not used")
            })
          )
        )
        const [content] = served.contents
        assert.strictEqual(
          "text" in content ? content.text : undefined,
          Exit.isSuccess(skillExit)
            ? skillMd("name: refunds\ndescription: Process refunds", "Refund carefully.\n")
            : "Replaced.\n"
        )
      }).pipe(Effect.provide(McpServer.McpServer.layer)))

    // The ownership check must run when the Effect runs, not when it is constructed.
    it.effect("rejects an addResource Effect built before a skill claims its URI", () =>
      Effect.gen(function*() {
        const exit = yield* Effect.gen(function*() {
          const server = yield* McpServer.McpServer
          const pending = server.addResource({
            resource: new McpSchema.Resource({ uri: "skill://refunds/SKILL.md", name: "Replacement" }),
            annotations: Context.empty(),
            handle: Effect.succeed({ contents: [{ uri: "skill://refunds/SKILL.md", text: "Replaced.\n" }] })
          })
          yield* McpServer.registerSkill(refunds())
          yield* pending
        }).pipe(Effect.provide(McpServer.McpServer.layer), Effect.exit)
        assertRejected(exit, /skill:\/\/refunds\/SKILL\.md is a file of a registered skill/)
      }))
  })
})
