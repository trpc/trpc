import type { MigrationAnnotation } from "./Annotations.ts"
import type { ApiChange, ApiDiff, ChangeClassification } from "./Model.ts"

const breakingClassifications = new Set<ChangeClassification>([
  "bucket-changed",
  "declaration-kind-changed",
  "overload-removed",
  "overload-reordered",
  "parameter-removed",
  "parameter-reordered",
  "parameter-changed",
  "return-type-changed",
  "generic-parameter-changed",
  "member-removed",
  "member-changed",
  "heritage-changed",
  "union-member-changed",
  "intersection-member-changed",
  "structural-change"
])

const stableApiId = (id: string): string => id.replace(/#(?:type|value)$/, "")

const displayApiId = (id: string): string => {
  const separator = id.indexOf("#")
  if (separator === -1) {
    return id
  }
  const module = id.slice(0, separator).split("/").at(-1)!
  return `${module}.${id.slice(separator + 1)}`
}

const backtickDelimiter = (value: string, minimum: number): string => {
  let length = minimum
  for (const match of value.matchAll(/`+/g)) {
    length = Math.max(length, match[0].length + 1)
  }
  return "`".repeat(length)
}

const codeSpan = (value: string): string => {
  const delimiter = backtickDelimiter(value, 1)
  const content = value.startsWith("`") || value.endsWith("`") ? ` ${value} ` : value
  return `${delimiter}${content}${delimiter}`
}

const escapeMarkdownText = (value: string): string => value.replace(/\\/g, "\\\\").replace(/[~<>*_]/g, "\\$&")

const escapeAnnotationText = (value: string): string => {
  const output: Array<string> = []
  let index = 0
  while (index < value.length) {
    const start = value.indexOf("`", index)
    if (start === -1) {
      output.push(escapeMarkdownText(value.slice(index)))
      break
    }
    output.push(escapeMarkdownText(value.slice(index, start)))
    let end = start + 1
    while (value[end] === "`") {
      end++
    }
    const delimiter = value.slice(start, end)
    const close = value.indexOf(delimiter, end)
    if (close === -1) {
      output.push("\\`".repeat(delimiter.length))
      index = end
    } else {
      output.push(value.slice(start, close + delimiter.length))
      index = close + delimiter.length
    }
  }
  return output.join("")
}

const compareStrings = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0

const isBreakingChange = (change: ApiChange): boolean => {
  if (change.classification !== "parameter-added") {
    return breakingClassifications.has(change.classification)
  }
  const delta = change.delta as {
    readonly before?: ReadonlyArray<unknown>
    readonly after?: ReadonlyArray<{ readonly optional?: boolean; readonly rest?: boolean }>
  } | undefined
  const beforeLength = delta?.before?.length ?? 0
  return delta?.after?.slice(beforeLength).some((parameter) => !parameter.optional && !parameter.rest) ?? true
}

interface MigrationEntry {
  readonly id: string
  readonly module: string
  readonly rename: ApiChange | undefined
}

const importMapReplacements = (importMapSections: string): ReadonlyMap<string, ReadonlyArray<string>> => {
  const replacements = new Map<string, Array<string>>()
  for (const line of importMapSections.split(/\r?\n/)) {
    const match = /^(\S+) -> (\S+)(?: \(barrel: [^)]+\))?$/.exec(line)
    if (match === null) {
      continue
    }
    const targets = replacements.get(match[1]!)
    if (targets === undefined) {
      replacements.set(match[1]!, [match[2]!])
    } else if (!targets.includes(match[2]!)) {
      targets.push(match[2]!)
    }
  }
  return replacements
}

const removedModules = (diff: ApiDiff): ReadonlyArray<string> =>
  [
    ...new Set(diff.changes.flatMap((change) => {
      if (change.classification !== "module-removed") {
        return []
      }
      const from = (change.delta as { readonly from?: unknown } | undefined)?.from
      return typeof from === "string" ? [from] : []
    }))
  ].sort(compareStrings)

const sameStrings = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

const addedApiSignatures = (diff: ApiDiff): ReadonlyMap<string, ReadonlyArray<string>> => {
  const signatures = new Map<string, Array<string>>()
  for (const change of diff.changes) {
    if (change.classification !== "api-added" || change.headApiId === undefined || change.after === undefined) {
      continue
    }
    const id = stableApiId(change.headApiId)
    const group = signatures.get(id)
    if (group === undefined) {
      signatures.set(id, [change.after])
    } else {
      group.push(change.after)
    }
  }
  for (const group of signatures.values()) {
    group.sort(compareStrings)
  }
  return signatures
}

const isUnchangedModuleMove = (
  id: string,
  changes: ReadonlyArray<ApiChange>,
  removed: ReadonlySet<string>,
  replacements: ReadonlyMap<string, ReadonlyArray<string>>,
  addedSignatures: ReadonlyMap<string, ReadonlyArray<string>>
): boolean => {
  const separator = id.indexOf("#")
  const module = id.slice(0, separator)
  const targets = replacements.get(module)
  if (separator === -1 || !removed.has(module) || targets === undefined) {
    return false
  }
  const before = changes
    .filter((change) => change.classification === "api-removed" && change.before !== undefined)
    .map((change) => change.before!)
    .sort(compareStrings)
  if (before.length === 0) {
    return false
  }
  const path = id.slice(separator + 1)
  return targets.some((target) => {
    const after = addedSignatures.get(`${target}#${path}`)
    return after !== undefined && sameStrings(before, after)
  })
}

const isRemovalCoveredByModule = (
  id: string,
  removed: ReadonlySet<string>,
  annotations: ReadonlyMap<string, MigrationAnnotation>
): boolean => {
  const separator = id.indexOf("#")
  const module = id.slice(0, separator)
  if (separator === -1 || !removed.has(module) || annotations.get(module)?.replacement !== "none") {
    return false
  }
  const annotation = annotations.get(id)
  return annotation === undefined || annotation.replacement === "none"
}

const migrationEntries = (
  diff: ApiDiff,
  annotations: ReadonlyMap<string, MigrationAnnotation>,
  importMapSections: string
): ReadonlyArray<MigrationEntry> => {
  const grouped = new Map<string, Array<ApiChange>>()
  for (const change of diff.changes) {
    if (change.baseApiId === undefined) {
      continue
    }
    const id = stableApiId(change.baseApiId)
    const changes = grouped.get(id)
    if (changes === undefined) {
      grouped.set(id, [change])
    } else {
      changes.push(change)
    }
  }

  const entries: Array<MigrationEntry> = []
  const removedModuleSet = new Set(removedModules(diff))
  const replacements = importMapReplacements(importMapSections)
  const addedSignatures = addedApiSignatures(diff)
  for (const [id, changes] of grouped) {
    const rename = changes.find((change) => change.classification === "api-renamed")
    const breaking = changes.some(isBreakingChange)
    const removed = changes.some((change) => change.classification === "api-removed")
    const importMove = changes.some((change) => change.classification === "api-moved")
    if (
      isUnchangedModuleMove(id, changes, removedModuleSet, replacements, addedSignatures) ||
      (removed && isRemovalCoveredByModule(id, removedModuleSet, annotations)) ||
      (!breaking && rename === undefined && !removed) ||
      (importMove && rename === undefined && !breaking && !annotations.has(id))
    ) {
      continue
    }
    entries.push({
      id,
      module: id.split("#")[0]!,
      rename
    })
  }
  for (const [id, annotation] of annotations) {
    if (annotation.include === true && id.includes("#") && !entries.some((entry) => entry.id === id)) {
      entries.push({ id, module: id.split("#")[0]!, rename: undefined })
    }
  }
  return entries.sort((left, right) => compareStrings(left.module, right.module) || compareStrings(left.id, right.id))
}

const renderDetailedEntry = (
  entry: MigrationEntry,
  annotation: MigrationAnnotation,
  example: string
): ReadonlyArray<string> => {
  const fence = backtickDelimiter(example, 3)
  return [
    `#### ${codeSpan(displayApiId(entry.id))}`,
    "",
    `**Replacement:** ${codeSpan(annotation.replacement)}`,
    "",
    escapeAnnotationText(annotation.note),
    "",
    "**Example**",
    "",
    `${fence}ts`,
    example,
    fence,
    ""
  ]
}

const renderCompactEntry = (
  entry: MigrationEntry,
  annotation: MigrationAnnotation | undefined
): string => {
  if (annotation !== undefined) {
    return `- ${codeSpan(displayApiId(entry.id))} -> ${codeSpan(annotation.replacement)}: ${
      escapeAnnotationText(annotation.note)
    }`
  }
  const target = entry.rename?.headApiId
  return target === undefined
    ? `- ${codeSpan(displayApiId(entry.id))}: TODO: needs guidance`
    : `- ${codeSpan(displayApiId(entry.id))} -> ${codeSpan(displayApiId(stableApiId(target)))}: TODO: needs guidance`
}

export const extractImportMapSections = (document: string): string => {
  const start = document.indexOf("## Import Map")
  if (start === -1) {
    return "## Import Map\n\nNo import map is available.\n"
  }
  const apiRenames = document.indexOf("\n## API Renames", start)
  const removedModules = document.indexOf("\n## Removed Modules", start)
  const apiReference = document.indexOf("\n## API Reference", start)
  const ends = [apiRenames, removedModules, apiReference].filter((index) => index !== -1)
  const end = ends.length === 0 ? document.length : Math.min(...ends)
  return `${document.slice(start, end).trim()}\n`
}

export const renderMigrationDocument = (
  diff: ApiDiff,
  annotations: ReadonlyMap<string, MigrationAnnotation>,
  importMapSections: string
): string => {
  const entries = migrationEntries(diff, annotations, importMapSections)
  const replacements = importMapReplacements(importMapSections)
  const modulesRemoved = removedModules(diff)
  const modules = new Map<string, Array<MigrationEntry>>()
  for (const entry of entries) {
    const group = modules.get(entry.module)
    if (group === undefined) {
      modules.set(entry.module, [entry])
    } else {
      group.push(entry)
    }
  }
  const lines = [
    "<!-- dprint-ignore-file -->",
    "",
    "# v3 to v4 Migration Reference",
    "",
    `Base: \`${diff.base.ref}\` (\`${diff.base.sha}\`)`,
    "",
    `Head: \`${diff.head.ref}\` (\`${diff.head.sha}\`)`,
    "",
    "This file is generated from the API diff and `migration/annotations/*.yaml`.",
    "",
    importMapSections.trim(),
    "",
    "## Removed Modules",
    ""
  ]
  for (const module of modulesRemoved) {
    const annotation = annotations.get(module)
    const targets = replacements.get(module)
    if (annotation !== undefined) {
      lines.push(
        `- ${codeSpan(module)} -> ${codeSpan(annotation.replacement)}: ${escapeAnnotationText(annotation.note)}`
      )
    } else if (targets !== undefined) {
      lines.push(`- ${codeSpan(module)} -> ${targets.map(codeSpan).join(", ")}`)
    } else if ([...annotations.keys()].some((id) => id.startsWith(`${module}#`))) {
      lines.push(`- ${codeSpan(module)}: No single module replacement; follow the curated per-API guidance below.`)
    } else {
      lines.push(`- ${codeSpan(module)}: TODO: needs module guidance`)
    }
  }
  if (modulesRemoved.length === 0) {
    lines.push("No modules were removed.")
  }
  lines.push(
    "",
    "## API Reference",
    ""
  )
  for (const [module, moduleEntries] of modules) {
    lines.push(`### ${codeSpan(module)}`, "")
    for (const entry of moduleEntries) {
      const annotation = annotations.get(entry.id)
      if (annotation?.example !== undefined) {
        lines.push(...renderDetailedEntry(entry, annotation, annotation.example))
      } else {
        lines.push(renderCompactEntry(entry, annotation), "")
      }
    }
  }
  return `${lines.join("\n").trim()}\n`
}

export const markdownSafetyIssues = (document: string): ReadonlyArray<string> => {
  const issues: Array<string> = []
  let fence: string | undefined
  const lines = document.split("\n")
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!
    const fenceMatch = /^\s*(`{3,})(?:[^`]*)$/.exec(line)
    if (fence !== undefined) {
      if (line.trim() === fence) {
        fence = undefined
      }
      continue
    }
    if (fenceMatch !== null) {
      fence = fenceMatch[1]!
      continue
    }
    if (
      line === "<!-- dprint-ignore-file -->" ||
      line.startsWith("**Replacement:** ") ||
      line === "**Example**"
    ) {
      continue
    }
    let index = 0
    while (index < line.length) {
      const character = line[index]!
      if (character === "\\") {
        index += 2
        continue
      }
      if (character === "`") {
        let end = index + 1
        while (line[end] === "`") {
          end++
        }
        const delimiter = line.slice(index, end)
        const close = line.indexOf(delimiter, end)
        if (close === -1) {
          issues.push(`line ${lineIndex + 1}: unclosed inline code span`)
          break
        }
        index = close + delimiter.length
        continue
      }
      if (character === "~" || character === "<" || character === "*" || character === "_") {
        issues.push(`line ${lineIndex + 1}: unescaped ${JSON.stringify(character)}`)
      }
      index++
    }
  }
  if (fence !== undefined) {
    issues.push(`unclosed ${fence} code fence`)
  }
  return issues
}

export const unannotatedApiIds = (
  diff: ApiDiff,
  annotations: ReadonlyMap<string, MigrationAnnotation>,
  importMapSections = ""
): ReadonlyMap<string, ReadonlyArray<string>> => {
  const modules = new Map<string, Array<string>>()
  for (const entry of migrationEntries(diff, annotations, importMapSections)) {
    if (annotations.has(entry.id)) {
      continue
    }
    const ids = modules.get(entry.module)
    if (ids === undefined) {
      modules.set(entry.module, [entry.id])
    } else {
      ids.push(entry.id)
    }
  }
  return modules
}

export const unannotatedModuleIds = (
  diff: ApiDiff,
  annotations: ReadonlyMap<string, MigrationAnnotation>,
  importMapSections: string
): ReadonlyArray<string> => {
  const replacements = importMapReplacements(importMapSections)
  return removedModules(diff).filter((module) =>
    !annotations.has(module) &&
    !replacements.has(module) &&
    ![...annotations.keys()].some((id) => id.startsWith(`${module}#`))
  )
}

export const renderMissingAnnotations = (
  diff: ApiDiff,
  annotations: ReadonlyMap<string, MigrationAnnotation>,
  importMapSections = ""
): string => {
  const missingApis = unannotatedApiIds(diff, annotations, importMapSections)
  const missingModules = unannotatedModuleIds(diff, annotations, importMapSections)
  if (missingApis.size === 0 && missingModules.length === 0) {
    return "All migration APIs and removed modules have guidance.\n"
  }
  return `${
    [
      ...(missingModules.length === 0 ? [] : ["Removed modules:", ...missingModules.map((module) => `  - ${module}`)]),
      ...[...missingApis].flatMap(([module, ids]) => [
        `${module}:`,
        ...ids.map((id) => `  - ${id}`)
      ])
    ].join("\n")
  }\n`
}
