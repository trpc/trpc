#!/usr/bin/env node
/**
 * @since 4.0.0
 */
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Array from "effect/Array"
import * as Argument from "effect/cli/Argument"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import { pipe } from "effect/Function"
import * as Path from "effect/Path"
import type * as PlatformError from "effect/PlatformError"
import * as Stream from "effect/Stream"
import * as String from "effect/String"

const directory = Argument.Directory("directory", { mustExist: true })

const output = Flag.Path("output").pipe(
  Flag.withAlias("o"),
  Flag.withDescription("Output file path")
)

const watch = Flag.Boolean("watch").pipe(
  Flag.withAlias("w"),
  Flag.withDescription("Watch for file changes and regenerate documentation"),
  Flag.withDefault(false)
)

Command.make("effect-ai-docgen", { directory, output, watch }).pipe(
  Command.withHandler(Effect.fnUntraced(function*({ directory, output, watch }) {
    const fs = yield* FileSystem.FileSystem
    const markdown = yield* directoryToMarkdown(directory)
    yield* fs.writeFileString(output, markdown)

    if (!watch) return

    yield* Effect.logInfo("Watching for changes...")

    yield* fs.watch(directory).pipe(
      Stream.debounce(1000),
      Stream.tap(() => Effect.logInfo("Changes detected, regenerating documentation...")),
      Stream.switchMap(() =>
        directoryToMarkdown(directory).pipe(
          Stream.fromEffect
        )
      ),
      Stream.runForEach(Effect.fn(function*(markdown) {
        yield* fs.writeFileString(output, markdown)
        yield* Effect.logInfo("Documentation updated.")
      }))
    )
  })),
  Command.run({
    version: "0.0.0"
  }),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain
)

const directoryToMarkdown = Effect.fn("directoryToMarkdown")(
  function*(
    directory: string
  ): Effect.fn.Return<string, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path> {
    const pathService = yield* Path.Path
    const fs = yield* FileSystem.FileSystem

    const indexMd = yield* fs.readFileString(pathService.join(directory, "index.md")).pipe(
      Effect.map(String.trim),
      Effect.orElseSucceed(() => null)
    )

    const allFiles = yield* fs.readDirectory(directory)
    const hasInlineFiles = allFiles.some((file) => pathService.basename(file).startsWith("0") && /\.tsx?$/.test(file))

    const tsFileContent = yield* Effect.forEach(
      allFiles,
      Effect.fn(function*(file) {
        const filePath = pathService.join(directory, file)
        const stat = yield* fs.stat(filePath)
        const basename = pathService.basename(filePath)

        if (stat.type === "Directory") {
          if (basename === "fixtures") return null
          return `${yield* directoryToMarkdown(filePath)}\n`
        } else if (/\.tsx?$/.test(file)) {
          const metadata = yield* tsFileMetadata(filePath)

          if (metadata.fileNameWithoutExt.startsWith("0")) {
            return `### ${metadata.title}

${metadata.description ?? ""}

\`\`\`ts
${metadata.content}
\`\`\`
`
          }

          const relativePath = pathService.relative(process.cwd(), filePath)
          const link = `[${metadata.title}](./${relativePath})`
          let content = ""

          if (hasInlineFiles && metadata.fileNameWithoutExt.startsWith("10")) {
            content += `### More examples\n\n`
          }

          content += `- **${link}**`

          if (metadata.description) {
            if (metadata.description.includes("\n")) {
              const indentedDescription = metadata.description
                .split("\n")
                .map((line) => `  ${line}`)
                .join("\n")
              content += `:\n${indentedDescription}`
            } else {
              content += `: ${metadata.description}`
            }
          }
          return content
        }

        return null
      }),
      { concurrency: 5 }
    ).pipe(
      Effect.map(Array.filter((s): s is string => s !== null && s.trim() !== "")),
      Effect.map(Array.join("\n")),
      Effect.map(String.trim)
    )

    return indexMd ? `${indexMd}\n\n${tsFileContent}` : tsFileContent
  }
)

const tsFileMetadata = Effect.fn("tsFileMetadata")(function*(filePath: string) {
  const pathService = yield* Path.Path
  const fs = yield* FileSystem.FileSystem

  let content = yield* fs.readFileString(filePath)
  const fileNameWithoutExt = pathService.basename(filePath, pathService.extname(filePath))

  let title: string = pipe(
    fileNameWithoutExt,
    String.replaceAll(/^\d+/g, ""),
    String.replaceAll(/[-_]/g, " "),
    String.trim,
    String.capitalize
  )

  const firstDocString = content.indexOf("/**")
  if (firstDocString === -1) {
    return {
      title,
      description: undefined,
      content,
      fileNameWithoutExt
    } as const
  }

  const linesWithComment = content.slice(firstDocString).split("\n")

  let description = ""

  for (let i = 1; i < linesWithComment.length; i++) {
    const line = linesWithComment[i]
    if (!line.startsWith(" *")) break
    if (line.endsWith(" */")) {
      content = linesWithComment.slice(i + 1).join("\n").trim()
      break
    }
    const lineContent = line.replace(/^ \*\s?/, "")
    if (lineContent.startsWith("@title")) {
      title = lineContent.replace("@title", "").trim()
      continue
    }
    description += lineContent + "\n"
  }

  return {
    title,
    description: String.trim(description) || undefined,
    content,
    fileNameWithoutExt
  } as const
})
