import { fingerprint, stableJson } from "./Json.ts"
import type { ApiChange, ApiDiff, ApiEntity, ApiSnapshot, ChangeClassification, DeclarationModel } from "./Model.ts"

interface Match {
  readonly base: ApiEntity
  readonly head: ApiEntity
  readonly confidence: number
  readonly authoritative: boolean
  readonly note?: string
}

interface ApiGroup {
  readonly module: string
  readonly path: ReadonlyArray<string>
  readonly entities: ReadonlyArray<ApiEntity>
}

const pathName = (entity: ApiEntity): string => entity.path.at(-1) ?? ""

const levenshtein = (left: string, right: string): number => {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let previous = row[0]!
    row[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const above = row[rightIndex]!
      const diagonal = previous
      previous = above
      row[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? diagonal
        : Math.min(diagonal, above, row[rightIndex - 1]!) + 1
    }
  }
  return row[right.length]!
}

const nameSimilarity = (left: string, right: string): number => {
  const length = Math.max(left.length, right.length)
  return length === 0 ? 1 : 1 - levenshtein(left.toLowerCase(), right.toLowerCase()) / length
}

const entityFeatureCache = new WeakMap<ApiEntity, ReadonlySet<string>>()

const entityFeatures = (entity: ApiEntity): ReadonlySet<string> => {
  const cached = entityFeatureCache.get(entity)
  if (cached !== undefined) {
    return cached
  }
  const features = new Set<string>()
  for (const declaration of entity.declarations) {
    features.add(`declaration:${declaration.kind}`)
    for (const member of declaration.members ?? []) {
      features.add(`member:${member.kind}:${member.name}`)
    }
  }
  entityFeatureCache.set(entity, features)
  return features
}

const setSimilarity = (left: ReadonlySet<string>, right: ReadonlySet<string>): number => {
  if (left.size === 0 && right.size === 0) {
    return 1
  }
  let shared = 0
  for (const value of left) {
    if (right.has(value)) {
      shared++
    }
  }
  return shared / (left.size + right.size - shared)
}

const documentationTokenCache = new WeakMap<ApiEntity, ReadonlySet<string>>()

const documentationTokens = (entity: ApiEntity): ReadonlySet<string> => {
  const cached = documentationTokenCache.get(entity)
  if (cached !== undefined) {
    return cached
  }
  const tokens = new Set(
    (entity.documentation.summary ?? "")
      .toLowerCase()
      .match(/[a-z][a-z0-9]+/g)
      ?.filter((token) => token.length >= 4) ?? []
  )
  documentationTokenCache.set(entity, tokens)
  return tokens
}

const groupEntities = (entities: Iterable<ApiEntity>): ReadonlyArray<ApiGroup> => {
  const groups = new Map<string, Array<ApiEntity>>()
  for (const entity of entities) {
    const key = `${entity.module}#${entity.path.join(".")}`
    const group = groups.get(key)
    if (group === undefined) {
      groups.set(key, [entity])
    } else {
      group.push(entity)
    }
  }
  return [...groups.values()].map((group) => ({
    module: group[0]!.module,
    path: group[0]!.path,
    entities: group.sort((left, right) => left.bucket.localeCompare(right.bucket))
  }))
}

const groupName = (group: ApiGroup): string => group.path.at(-1) ?? ""

const groupSimilarity = (
  base: ApiGroup,
  head: ApiGroup
): number => {
  const facets = base.entities.flatMap((baseEntity) => {
    const headEntity = head.entities.find((candidate) => candidate.bucket === baseEntity.bucket)
    return headEntity === undefined ? [] : [{ base: baseEntity, head: headEntity }]
  })
  if (facets.length === 0) {
    return 0
  }
  const sameKind = facets.filter(({ base, head }) => base.declarationKind === head.declarationKind).length /
    facets.length
  const sameFingerprint = facets.filter(({ base, head }) => base.fingerprint === head.fingerprint).length /
    facets.length
  const structure = facets.reduce(
    (total, { base, head }) => total + setSimilarity(entityFeatures(base), entityFeatures(head)),
    0
  ) / facets.length
  const documentation = facets.reduce(
    (total, { base, head }) => total + setSimilarity(documentationTokens(base), documentationTokens(head)),
    0
  ) / facets.length
  const sameCategory = facets.some(({ base, head }) =>
    base.documentation.category !== undefined &&
    base.documentation.category === head.documentation.category
  )
  const headModuleName = head.module.split("/").at(-1)?.toLowerCase()
  const mentionsHeadModule = headModuleName !== undefined &&
    facets.some(({ base }) => documentationTokens(base).has(headModuleName))
  const moduleScore = base.module === head.module ? 0.25 : 0
  const packageScore = base.entities[0]!.packageName === head.entities[0]!.packageName ? 0.05 : 0
  return Math.min(
    0.99,
    0.2 * nameSimilarity(groupName(base), groupName(head)) +
      (groupName(base) === groupName(head) ? 0.15 : 0) +
      moduleScore +
      packageScore +
      0.4 * sameFingerprint +
      0.15 * sameKind +
      0.15 * structure +
      0.025 * documentation +
      (sameCategory ? 0.05 : 0) +
      (mentionsHeadModule ? 0.075 : 0)
  )
}

const changeId = (
  classification: ChangeClassification,
  base?: ApiEntity,
  head?: ApiEntity,
  suffix = ""
): string => `change-${fingerprint([classification, base?.id ?? null, head?.id ?? null, suffix]).slice(0, 16)}`

const makeChange = (
  classification: ChangeClassification,
  match: Partial<Match>,
  delta?: unknown,
  suffix = ""
): ApiChange => ({
  id: changeId(classification, match.base, match.head, suffix),
  classification,
  confidence: match.confidence ?? 1,
  baseApiId: match.base?.id,
  headApiId: match.head?.id,
  before: match.base?.displaySignature,
  after: match.head?.displaySignature,
  delta,
  baseSource: match.base?.source,
  headSource: match.head?.source,
  reviewNotes: match.note,
  authoritative: match.authoritative ?? true
})

const declarationHash = (value: unknown): string => fingerprint(value)

const memberMap = (declarations: ReadonlyArray<DeclarationModel>): Map<string, DeclarationModel> =>
  new Map(
    declarations.flatMap((declaration) => declaration.members ?? [])
      .map((member) => [`${member.kind}:${member.name}`, member])
  )

const classifyStructure = (match: Match): ReadonlyArray<ApiChange> => {
  const base = match.base
  const head = match.head
  const changes: Array<ApiChange> = []
  if (base.bucket !== head.bucket) {
    changes.push(makeChange("bucket-changed", match, { before: base.bucket, after: head.bucket }))
  }
  if (base.declarationKind !== head.declarationKind) {
    changes.push(makeChange("declaration-kind-changed", match, {
      before: base.declarationKind,
      after: head.declarationKind
    }))
  }

  const baseDeclarations = base.declarations
  const headDeclarations = head.declarations
  const baseSignatures = baseDeclarations.filter((declaration) =>
    declaration.kind === "function" || declaration.kind === "method"
  )
  const headSignatures = headDeclarations.filter((declaration) =>
    declaration.kind === "function" || declaration.kind === "method"
  )
  if (headSignatures.length > baseSignatures.length) {
    changes.push(makeChange("overload-added", match, {
      before: baseSignatures.length,
      after: headSignatures.length
    }))
  } else if (headSignatures.length < baseSignatures.length) {
    changes.push(makeChange("overload-removed", match, {
      before: baseSignatures.length,
      after: headSignatures.length
    }))
  } else if (
    baseSignatures.length > 1 &&
    stableJson(baseSignatures.map(declarationHash).sort()) === stableJson(headSignatures.map(declarationHash).sort()) &&
    stableJson(baseSignatures.map(declarationHash)) !== stableJson(headSignatures.map(declarationHash))
  ) {
    changes.push(makeChange("overload-reordered", match))
  }

  const comparedSignatures = Math.min(baseSignatures.length, headSignatures.length)
  for (let index = 0; index < comparedSignatures; index++) {
    const before = baseSignatures[index]!
    const after = headSignatures[index]!
    const beforeParameters = before.parameters ?? []
    const afterParameters = after.parameters ?? []
    if (afterParameters.length > beforeParameters.length) {
      changes.push(makeChange("parameter-added", match, {
        overload: index,
        before: beforeParameters,
        after: afterParameters
      }, String(index)))
    } else if (afterParameters.length < beforeParameters.length) {
      changes.push(makeChange("parameter-removed", match, {
        overload: index,
        before: beforeParameters,
        after: afterParameters
      }, String(index)))
    } else if (
      stableJson(beforeParameters.map((parameter) => parameter.name).sort()) ===
        stableJson(afterParameters.map((parameter) => parameter.name).sort()) &&
      stableJson(beforeParameters.map((parameter) => parameter.name)) !==
        stableJson(afterParameters.map((parameter) => parameter.name))
    ) {
      changes.push(makeChange("parameter-reordered", match, {
        overload: index,
        before: beforeParameters,
        after: afterParameters
      }, String(index)))
    } else if (stableJson(beforeParameters) !== stableJson(afterParameters)) {
      changes.push(makeChange("parameter-changed", match, {
        overload: index,
        before: beforeParameters,
        after: afterParameters
      }, String(index)))
    }
    if (stableJson(before.returnType) !== stableJson(after.returnType)) {
      changes.push(makeChange("return-type-changed", match, {
        overload: index,
        before: before.returnType,
        after: after.returnType
      }, String(index)))
    }
    if (stableJson(before.typeParameters) !== stableJson(after.typeParameters)) {
      changes.push(makeChange("generic-parameter-changed", match, {
        overload: index,
        before: before.typeParameters,
        after: after.typeParameters
      }, String(index)))
    }
  }

  const baseMembers = memberMap(baseDeclarations)
  const headMembers = memberMap(headDeclarations)
  for (const [key, member] of baseMembers) {
    const next = headMembers.get(key)
    if (next === undefined) {
      changes.push(makeChange("member-removed", match, { member }, key))
    } else if (stableJson(member) !== stableJson(next)) {
      changes.push(makeChange("member-changed", match, { before: member, after: next }, key))
    }
  }
  for (const [key, member] of headMembers) {
    if (!baseMembers.has(key)) {
      changes.push(makeChange("member-added", match, { member }, key))
    }
  }

  const baseHeritage = baseDeclarations.flatMap((declaration) => declaration.heritage ?? [])
  const headHeritage = headDeclarations.flatMap((declaration) => declaration.heritage ?? [])
  if (stableJson(baseHeritage) !== stableJson(headHeritage)) {
    changes.push(makeChange("heritage-changed", match, { before: baseHeritage, after: headHeritage }))
  }

  const baseTypes = baseDeclarations.map((declaration) => declaration.type)
  const headTypes = headDeclarations.map((declaration) => declaration.type)
  const baseKinds = new Set(baseTypes.flatMap((type) => type?.kind === undefined ? [] : [type.kind]))
  const headKinds = new Set(headTypes.flatMap((type) => type?.kind === undefined ? [] : [type.kind]))
  if ((baseKinds.has("union") || headKinds.has("union")) && stableJson(baseTypes) !== stableJson(headTypes)) {
    changes.push(makeChange("union-member-changed", match, { before: baseTypes, after: headTypes }))
  }
  if (
    (baseKinds.has("intersection") || headKinds.has("intersection")) &&
    stableJson(baseTypes) !== stableJson(headTypes)
  ) {
    changes.push(makeChange("intersection-member-changed", match, { before: baseTypes, after: headTypes }))
  }
  if (stableJson(base.documentation) !== stableJson(head.documentation)) {
    changes.push(makeChange("documentation-changed", match, {
      before: base.documentation,
      after: head.documentation
    }))
  }
  if (base.fingerprint !== head.fingerprint && changes.length === 0) {
    changes.push(makeChange("structural-change", match, {
      before: base.declarations,
      after: head.declarations
    }))
  }
  return changes
}

const movementChange = (match: Match): ApiChange | undefined => {
  const beforeName = pathName(match.base)
  const afterName = pathName(match.head)
  if (beforeName !== afterName) {
    return makeChange("api-renamed", match)
  }
  if (match.base.module !== match.head.module || match.base.path.join(".") !== match.head.path.join(".")) {
    return makeChange("api-moved", match)
  }
  return undefined
}

const moduleChanges = (base: ApiSnapshot, head: ApiSnapshot): ReadonlyArray<ApiChange> => {
  const changes: Array<ApiChange> = []
  const basePackages = new Set(base.packages)
  const headPackages = new Set(head.packages)
  for (const packageName of basePackages) {
    if (!headPackages.has(packageName)) {
      changes.push({
        id: `change-${fingerprint(["package-removed", packageName]).slice(0, 16)}`,
        classification: "package-removed",
        confidence: 1,
        delta: { packageName },
        authoritative: true
      })
    }
  }
  for (const packageName of headPackages) {
    if (!basePackages.has(packageName)) {
      changes.push({
        id: `change-${fingerprint(["package-added", packageName]).slice(0, 16)}`,
        classification: "package-added",
        confidence: 1,
        delta: { packageName },
        authoritative: true
      })
    }
  }
  const baseModules = new Set(base.entrypoints.map((entrypoint) => entrypoint.module))
  const headModules = new Set(head.entrypoints.map((entrypoint) => entrypoint.module))
  for (const module of baseModules) {
    if (!headModules.has(module)) {
      changes.push({
        id: `change-${fingerprint(["module-removed", module]).slice(0, 16)}`,
        classification: "module-removed",
        confidence: 1,
        delta: { from: module, to: [] },
        authoritative: true
      })
    }
  }
  for (const module of headModules) {
    if (!baseModules.has(module)) {
      changes.push({
        id: `change-${fingerprint(["module-added", module]).slice(0, 16)}`,
        classification: "module-added",
        confidence: 1,
        delta: { to: [module] },
        authoritative: true
      })
    }
  }
  return changes
}

export const diffSnapshots = (base: ApiSnapshot, head: ApiSnapshot): ApiDiff => {
  const unmatchedBase = new Map(base.entities.map((entity) => [entity.id, entity]))
  const unmatchedHead = new Map(head.entities.map((entity) => [entity.id, entity]))
  const matches: Array<Match> = []
  const suggestedMatches: Array<Match> = []

  const addMatch = (
    baseEntity: ApiEntity | undefined,
    headEntity: ApiEntity | undefined,
    details: Omit<Match, "base" | "head">
  ): boolean => {
    if (
      baseEntity === undefined || headEntity === undefined ||
      !unmatchedBase.has(baseEntity.id) || !unmatchedHead.has(headEntity.id)
    ) {
      return false
    }
    unmatchedBase.delete(baseEntity.id)
    unmatchedHead.delete(headEntity.id)
    matches.push({ base: baseEntity, head: headEntity, ...details })
    return true
  }

  for (const baseEntity of unmatchedBase.values()) {
    addMatch(baseEntity, unmatchedHead.get(baseEntity.id), {
      confidence: 1,
      authoritative: true
    })
  }

  const headGroups = groupEntities(unmatchedHead.values())
  for (const baseGroup of groupEntities(unmatchedBase.values())) {
    const ranked = headGroups
      .filter((group) =>
        groupName(group) === groupName(baseGroup) ||
        group.module === baseGroup.module ||
        baseGroup.entities.some((baseEntity) =>
          group.entities.some((headEntity) =>
            baseEntity.bucket === headEntity.bucket &&
            baseEntity.fingerprint === headEntity.fingerprint
          )
        )
      )
      .map((group) => ({ group, score: groupSimilarity(baseGroup, group) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) =>
        right.score - left.score ||
        left.group.module.localeCompare(right.group.module) ||
        left.group.path.join(".").localeCompare(right.group.path.join("."))
      )
    const best = ranked[0]
    const next = ranked[1]
    if (best === undefined || best.score < 0.5 || (next !== undefined && best.score - next.score < 0.05)) {
      continue
    }
    for (const baseEntity of baseGroup.entities) {
      const headEntity = best.group.entities.find((candidate) => candidate.bucket === baseEntity.bucket)
      if (headEntity !== undefined) {
        suggestedMatches.push({
          base: baseEntity,
          head: headEntity,
          confidence: Number(best.score.toFixed(3)),
          authoritative: false,
          note: "Suggested replacement for removed API; requires review"
        })
      }
    }
  }

  const changes = [...moduleChanges(base, head)]
  for (const match of matches) {
    changes.push(...classifyStructure(match))
  }
  for (const match of suggestedMatches) {
    const movement = movementChange(match)
    if (movement !== undefined) {
      changes.push(movement)
    }
  }
  for (const entity of unmatchedBase.values()) {
    changes.push(makeChange("api-removed", {
      base: entity,
      confidence: 1,
      authoritative: true
    }))
  }
  for (const entity of unmatchedHead.values()) {
    changes.push(makeChange("api-added", {
      head: entity,
      confidence: 1,
      authoritative: true
    }))
  }

  return {
    version: 1,
    base: { ref: base.ref, sha: base.sha },
    head: { ref: head.ref, sha: head.sha },
    changes: changes.sort((left, right) =>
      left.classification.localeCompare(right.classification) ||
      (left.baseApiId ?? "").localeCompare(right.baseApiId ?? "") ||
      (left.headApiId ?? "").localeCompare(right.headApiId ?? "") ||
      left.id.localeCompare(right.id)
    )
  }
}
