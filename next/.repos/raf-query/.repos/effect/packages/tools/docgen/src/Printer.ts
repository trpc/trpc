/**
 * Renders parsed documentation models as Markdown.
 *
 * @since 0.6.0
 */
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Order from "effect/Order"
import * as Record from "effect/Record"
import * as String from "effect/String"
import * as Prettier from "prettier"
import * as Configuration from "./Configuration.ts"
import type * as Domain from "./Domain.ts"
import * as Parser from "./Parser.ts"

/** @internal */
export type Printable =
  | Domain.Class
  | Domain.Constant
  | Domain.Export
  | Domain.Function
  | Domain.Interface
  | Domain.TypeAlias
  | Domain.Namespace

const Markdown = {
  bold: (content: string) => `**${content}**`,
  fence: (content: string) => `\`\`\`ts\n${content}\n\`\`\`\n\n`,
  strikethrough: (content: string) => `~~${content}~~`
}

/**
 * Replaces the link from a JSDoc link tag with a simple text.
 *
 * Given "This is a description containing two links to {@link foo} and {@link bar baz}."
 * returns "This is a description containing two links to `foo` and `baz`."
 */
function replaceJSDocLinks(text: string): string {
  return text.replace(/\{@link\s+([^\s}]+)(?:\s+([^}]+))?\}/g, (_, link, label) => {
    // Use the label if provided; otherwise, use the link target
    return `\`${(label || link).trim()}\``
  })
}

/**
 * Removes all extra metadata from fenced code blocks in a Markdown string.
 * For each code fence, only the first token (the language identifier) is preserved.
 */
function removeFenceMetadata(markdown: string): string {
  return markdown.replace(/^(`{3,})([^\n]*)/gm, (_match, fence, info) => {
    // Trim the info string and split by whitespace into tokens.
    // The first token (if present) is typically the language identifier.
    const tokens = info.trim().split(/\s+/)
    // Rebuild the fence line with just the language (if it exists)
    return fence + (tokens[0] || "")
  })
}

const printOptionalDescription = (description: string | undefined) => {
  return Effect.gen(function*() {
    if (description === undefined) {
      return ""
    }
    const config = yield* Configuration.Configuration
    const descriptionWithoutLinks = replaceJSDocLinks(description)
    const out = config.theme === Configuration.DEFAULT_THEME
      ? removeFenceMetadata(descriptionWithoutLinks)
      : descriptionWithoutLinks
    return `\n\n${out}`
  })
}

const printArray = (title: string, ss?: ReadonlyArray<string>): string => {
  if (ss === undefined || ss.length === 0) {
    return ""
  }
  return `\n\n${Markdown.bold(title)}\n\n${ss.join("\n")}`
}

const printFence = (code: string): string => {
  if (code.startsWith("```ts") || code.startsWith("~~~ts")) {
    return code
  }
  return "```ts\n" + code + "\n```"
}

const printOptionalSignature = (signature?: string): string => {
  if (signature === undefined) {
    return ""
  }
  return `\n\n${Markdown.bold("Signature")}\n\n${printFence(signature)}`
}

const printThrowsArray = (throws?: ReadonlyArray<string>): string => printArray("Throws", throws)

const printExamplesArray = (examples: ReadonlyArray<string>): string => {
  if (examples.length === 0) {
    return ""
  }
  return examples.map((ex) => "\n\n**Example**\n\n" + printFence(ex)).join("")
}

const printOptionalSince = (since: ReadonlyArray<string>): string => {
  if (since.length === 0) {
    return ""
  }
  return `\n\nSince v${since.join(", ")}`
}

const printHeaderByIndentation = (indentation: number) => {
  switch (indentation) {
    case 0:
      return "## "
    case 1:
      return "### "
    default:
      return "#### "
  }
}

const printTitle = (s: string, deprecated: ReadonlyArray<string>, postfix?: string): string => {
  const name = s.trim() === "hasOwnProperty" ? `${s} (function)` : s
  const title = deprecated.length > 0 ? Markdown.strikethrough(name) : name
  return postfix === undefined ? title : title + ` ${postfix}`
}

const printSeesArray = (sees?: ReadonlyArray<string>): string => {
  if (sees === undefined || sees.length === 0) {
    return ""
  }
  return `\n\n${Markdown.bold("See")}\n\n${sees.map((see) => `- ${replaceJSDocLinks(see)}`).join("\n")}`
}

const printOptionalSourceLink = (position?: Domain.Position) => {
  return Effect.gen(function*() {
    if (position === undefined) {
      return ""
    }
    const config = yield* Configuration.Configuration
    const source = yield* Parser.Source
    const name = source.sourceFile.getBaseName()
    return `\n\n[Source](${config.srcLink}${name}#L${position.line})`
  })
}

const printModel = (name: string, doc: Domain.Doc, options: {
  readonly signature?: string | undefined
  readonly position?: Domain.Position | undefined
  readonly indentation?: number | undefined
  readonly postfix?: string | undefined
}) => {
  return Effect.gen(function*() {
    const sourceLink = yield* printOptionalSourceLink(options.position)
    const description = yield* printOptionalDescription(doc.description)
    return printHeaderByIndentation(options.indentation ?? 0) + printTitle(name, doc.deprecated, options.postfix) +
      description +
      printThrowsArray(doc.throws) +
      printExamplesArray(doc.examples) +
      printSeesArray(doc.sees) +
      printOptionalSignature(options.signature) +
      sourceLink +
      printOptionalSince(doc.since)
  })
}

const printEntry = (model: Domain.DocEntry, options: {
  readonly indentation?: number | undefined
  readonly postfix?: string | undefined
}) => {
  return printModel(model.name, model.doc, {
    signature: model.signature,
    position: model.position,
    indentation: options.indentation,
    postfix: options.postfix
  })
}

const printStaticMethod = (model: Domain.DocEntry) => {
  return printEntry(model, {
    indentation: 1,
    postfix: "(static method)"
  })
}

const printMethod = (model: Domain.DocEntry) => {
  return printEntry(model, {
    indentation: 1,
    postfix: "(method)"
  })
}

const printProperty = (model: Domain.DocEntry) => {
  return printEntry(model, {
    indentation: 1,
    postfix: "(property)"
  })
}

const printClass = (model: Domain.Class) => {
  return Effect.gen(function*() {
    const header = yield* printEntry(model, {
      postfix: "(class)"
    })
    const staticMethods = yield* Effect.forEach(model.staticMethods, (method) => printStaticMethod(method))
    const methods = yield* Effect.forEach(model.methods, (method) => printMethod(method))
    const properties = yield* Effect.forEach(model.properties, (property) => printProperty(property))
    return header +
      staticMethods.map((s) => "\n\n" + s).join("") +
      methods.map((s) => "\n\n" + s).join("") +
      properties.map((s) => "\n\n" + s).join("")
  })
}

const printConstant = (model: Domain.Constant) => {
  return printEntry(model, {})
}

const printExport = (model: Domain.Export) => {
  return printEntry(model, {
    postfix: model.isNamespaceExport ? "(namespace export)" : undefined
  })
}

const printFunction = (model: Domain.Function) => {
  return printEntry(model, {})
}

const printInterface = (model: Domain.Interface, indentation: number) => {
  return printEntry(model, {
    indentation,
    postfix: "(interface)"
  })
}

const printTypeAlias = (model: Domain.TypeAlias, indentation: number) => {
  return printEntry(model, {
    indentation,
    postfix: "(type alias)"
  })
}

const printNamespace = (
  model: Domain.Namespace,
  indentation: number
): Effect.Effect<string, never, Configuration.Configuration | Parser.Source> => {
  return Effect.gen(function*() {
    const header = yield* printModel(model.name, model.doc, {
      position: model.position,
      indentation,
      postfix: "(namespace)"
    })
    const interfaces = yield* Effect.forEach(model.interfaces, (inter) => printInterface(inter, indentation + 1))
    const typeAliases = yield* Effect.forEach(
      model.typeAliases,
      (typeAlias) => printTypeAlias(typeAlias, indentation + 1)
    )
    const namespaces = yield* Effect.forEach(
      model.namespaces,
      (namespace) => printNamespace(namespace, indentation + 1)
    )
    return header +
      interfaces.map((s) => "\n\n" + s).join("") +
      typeAliases.map((s) => "\n\n" + s).join("") +
      namespaces.map((s) => "\n\n" + s).join("")
  })
}

/** @internal */
export const print = (p: Printable) => {
  switch (p._tag) {
    case "Class":
      return printClass(p)
    case "Constant":
      return printConstant(p)
    case "Export":
      return printExport(p)
    case "Function":
      return printFunction(p)
    case "Interface":
      return printInterface(p, 0)
    case "TypeAlias":
      return printTypeAlias(p, 0)
    case "Namespace":
      return printNamespace(p, 0)
  }
}

const DEFAULT_CATEGORY = "utils"

const byCategory = Order.mapInput(
  String.Order,
  ([category]: [string, ...Array<unknown>]) => category
)

const getPrintables = (module: Domain.Module): ReadonlyArray<Printable> =>
  Array.flatten([
    module.classes,
    module.constants,
    module.exports,
    module.functions,
    module.interfaces,
    module.typeAliases,
    module.namespaces
  ])

const sortByName: <A extends { name: string }>(self: Iterable<A>) => Array<A> = Array.sort(
  pipe(
    String.Order,
    Order.mapInput(({ name }: { name: string }) => name)
  )
)

/**
 * Renders a parsed module as a Markdown documentation page.
 *
 * @category printers
 * @since 0.6.0
 */
export const printModule = (module: Domain.Module) => {
  return Effect.gen(function*() {
    const description = yield* printModel(module.name, module.doc, {
      postfix: "overview"
    })

    const printables = pipe(
      sortByName(getPrintables(module)),
      Array.groupBy((printable) =>
        printable.doc.category.length === 0 ? DEFAULT_CATEGORY : printable.doc.category.join(", ")
      ),
      Record.toEntries,
      Array.sort(byCategory)
    )

    const strings = yield* Effect.forEach(printables, ([category, printables]) =>
      Effect.gen(function*() {
        const out = `\n\n# ${category}`
        const strings = yield* Effect.forEach(sortByName(printables), (printable) => print(printable))
        return out + strings.map((s) => "\n\n" + s).join("")
      }))

    const content = strings.join("")

    return `${description}

<!-- toc -->${content}`
  }).pipe(Effect.provideService(Parser.Source, module.source))
}

const defaultPrettierOptions: Prettier.Options = {
  parser: "markdown",
  semi: false,
  singleQuote: false,
  printWidth: 120,
  trailingComma: "none"
}

/**
 * Renders the front matter for a generated module page.
 *
 * @category printers
 * @since 0.6.0
 */
export const printFrontMatter = (module: Domain.Module, nav_order: number): string => {
  return `---
title: ${module.name}
nav_order: ${nav_order}
parent: Modules
---`
}

/**
 * Formats generated Markdown with the docgen Prettier settings.
 *
 * @category printers
 * @since 0.6.0
 */
export function prettify(s: string) {
  return Effect.tryPromise({
    try: () => Prettier.format(s, defaultPrettierOptions),
    catch: globalThis.String
  }).pipe(Effect.orDie)
}
