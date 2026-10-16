import type { ApiChange, ApiDiff } from "./Model.ts"

const unstableDomains = new Set([
  "ai",
  "arbitrary",
  "cli",
  "cluster",
  "devtools",
  "encoding",
  "eventlog",
  "http",
  "http-api",
  "net",
  "observability",
  "persistence",
  "process",
  "reactivity",
  "rpc",
  "schema",
  "socket",
  "sql",
  "workers",
  "workflow"
])

const unstableDomain = (module: string): string | undefined => {
  const segments = module.split("/")
  const domain = segments[1] === "unstable" ? segments[2] : segments[1]
  return domain !== undefined && segments[0] === "effect" && unstableDomains.has(domain) ? domain : undefined
}

const changeModule = (change: ApiChange): string => {
  const id = change.headApiId ?? change.baseApiId
  const delta = change.delta as {
    readonly packageName?: string
    readonly from?: string
    readonly to?: ReadonlyArray<string>
  } | undefined
  return id?.split("#")[0] ?? delta?.packageName ?? delta?.from ?? delta?.to?.[0] ?? "<package>"
}

const isUnstableChange = (change: ApiChange): boolean => unstableDomain(changeModule(change)) !== undefined

const escapeCell = (value: string): string => value.replaceAll("|", "\\|").replaceAll("\n", " ")

const changeLabel = (change: ApiChange): string =>
  change.baseApiId === undefined
    ? change.headApiId ?? JSON.stringify(change.delta)
    : change.headApiId === undefined
    ? change.baseApiId
    : `${change.baseApiId} → ${change.headApiId}`

const signature = (label: string, source: string | undefined): ReadonlyArray<string> =>
  source === undefined ? [] : ["", `${label}:`, "", "```ts", source, "```"]

const renderChange = (change: ApiChange, level = 4): ReadonlyArray<string> => [
  `${"#".repeat(level)} ${change.classification}: \`${changeLabel(change)}\``,
  "",
  `Confidence: ${change.confidence.toFixed(3)} · ${change.authoritative ? "authoritative" : "review required"}`,
  ...(change.reviewNotes === undefined ? [] : ["", change.reviewNotes]),
  ...signature("Before", change.before),
  ...signature("After", change.after),
  ""
]

const orderedGroups = [
  ["Renames and moves", new Set(["api-moved", "api-renamed"])],
  ["Removals", new Set(["package-removed", "module-removed", "api-removed"])],
  ["Additions", new Set(["package-added", "module-added", "api-added"])],
  [
    "Signature and structural changes",
    new Set([
      "bucket-changed",
      "declaration-kind-changed",
      "overload-added",
      "overload-removed",
      "overload-reordered",
      "parameter-added",
      "parameter-removed",
      "parameter-reordered",
      "parameter-changed",
      "return-type-changed",
      "generic-parameter-changed",
      "member-added",
      "member-removed",
      "member-changed",
      "heritage-changed",
      "union-member-changed",
      "intersection-member-changed",
      "structural-change"
    ])
  ],
  ["Documentation changes", new Set(["documentation-changed"])]
] as const

export const renderMarkdownReport = (diff: ApiDiff): string => {
  const counts = new Map<string, number>()
  for (const change of diff.changes) {
    counts.set(change.classification, (counts.get(change.classification) ?? 0) + 1)
  }
  const authoritative = diff.changes.filter((change) => change.authoritative)
  const suggested = diff.changes.filter((change) => !change.authoritative)
  const moduleCounts = new Map<string, number>()
  for (const change of diff.changes) {
    const module = changeModule(change)
    moduleCounts.set(module, (moduleCounts.get(module) ?? 0) + 1)
  }
  const lines: Array<string> = [
    "# TypeScript API Diff",
    "",
    `Base: \`${diff.base.ref}\` (\`${diff.base.sha}\`)`,
    "",
    `Head: \`${diff.head.ref}\` (\`${diff.head.sha}\`)`,
    "",
    "This report describes structural API changes and review confidence; it is not a semantic-version compatibility claim.",
    "",
    "## Summary",
    "",
    "| Classification | Count |",
    "| --- | ---: |",
    ...[...counts].sort(([left], [right]) => left.localeCompare(right))
      .map(([classification, count]) => `| ${escapeCell(classification)} | ${count} |`),
    "",
    "## Changes by module",
    "",
    "| Domain | Module | Count |",
    "| --- | --- | ---: |",
    ...[...moduleCounts].sort(([left], [right]) => left.localeCompare(right)).map(([module, count]) => {
      const unstable = unstableDomain(module)
      const domain = unstable === undefined
        ? module.startsWith("@effect/")
          ? module.split("/").slice(0, 2).join("/")
          : "stable"
        : `unstable/${unstable}`
      return `| ${escapeCell(domain)} | ${escapeCell(module)} | ${count} |`
    }),
    ""
  ]
  const sections = [
    [
      "Stable API changes",
      authoritative.filter((change) => !isUnstableChange(change))
    ],
    [
      "Unstable API changes",
      authoritative.filter(isUnstableChange)
    ]
  ] as const
  for (const [section, sectionChanges] of sections) {
    if (sectionChanges.length === 0) {
      continue
    }
    lines.push(`## ${section}`, "")
    for (const [title, classifications] of orderedGroups) {
      const changes = sectionChanges.filter((change) => classifications.has(change.classification))
      if (changes.length === 0) {
        continue
      }
      lines.push(`### ${title}`, "")
      for (const change of changes) {
        lines.push(...renderChange(change))
      }
    }
  }
  if (suggested.length > 0) {
    lines.push("## Suggested replacements for removed APIs", "")
    for (const change of suggested) {
      lines.push(...renderChange(change, 3))
    }
  }
  return `${lines.join("\n").trim()}\n`
}
