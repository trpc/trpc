/**
 * Parses TypeScript declarations and JSDoc into docgen models.
 *
 * @since 0.6.0
 */
import * as doctrine from "doctrine"
import * as Array from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Record from "effect/Record"
import * as String from "effect/String"
import * as ast from "ts-morph"
import * as Configuration from "./Configuration.ts"
import * as Domain from "./Domain.ts"

/**
 * Source file and path currently being parsed.
 *
 * @category services
 * @since 0.6.0
 */
export interface SourceShape {
  readonly path: Array.NonEmptyReadonlyArray<string>
  readonly sourceFile: ast.SourceFile
}

/** @internal */
export class Source extends Context.Service<Source, SourceShape>()("@effect/docgen/Source") {}

const sortModulesByPath: <A extends Domain.Module>(self: Iterable<A>) => Array<A> = Array
  .sort(Domain.ByPath)

const getJSDocText: (jsdocs: ReadonlyArray<ast.JSDoc>) => string = Array.matchRight({
  onEmpty: () => "",
  onNonEmpty: (_, last) => last.getText()
})

const getDocComment = (ranges: ReadonlyArray<ast.CommentRange>): Option.Option<ast.CommentRange> =>
  pipe(
    ranges,
    Array.filter((range) => range.getText().startsWith("/**")),
    Array.last
  )

class Comment {
  readonly description: string | undefined
  readonly tags: Record<string, ReadonlyArray<string> | undefined>
  constructor(
    description: string | undefined,
    tags: Record<string, ReadonlyArray<string> | undefined>
  ) {
    this.description = description
    this.tags = tags
  }
}

/**
 * @internal
 */
export const parseComment = (text: string): Comment => {
  const annotation: doctrine.Annotation = doctrine.parse(text, {
    unwrap: true
  })

  const description = pipe(
    Option.fromNullishOr(annotation.description),
    Option.map((s) => s.trim()),
    Option.filter(String.isNonEmpty),
    Option.getOrUndefined
  )

  const tags = pipe(
    annotation.tags,
    Array.groupBy((tag) => tag.title),
    Record.map((values) =>
      Array.map(values, (tag) =>
        pipe(
          Option.fromNullishOr(tag.description),
          Option.map(String.trim),
          Option.getOrElse(() => "")
        ))
    )
  )

  return { description, tags }
}

const isVariableDeclarationList = (
  u: ast.VariableDeclarationList | ast.CatchClause
): u is ast.VariableDeclarationList => u.getKind() === ast.ts.SyntaxKind.VariableDeclarationList

const isVariableStatement = (
  u:
    | ast.VariableStatement
    | ast.ForStatement
    | ast.ForOfStatement
    | ast.ForInStatement
): u is ast.VariableStatement => u.getKind() === ast.ts.SyntaxKind.VariableStatement

const parseDoc = (text: string) => {
  const comment = parseComment(text)
  return new Domain.Doc(
    comment.description,
    comment.tags["since"] ?? [],
    comment.tags["deprecated"] ?? [],
    comment.tags["example"] ?? [],
    comment.tags["category"] ?? [],
    comment.tags["throws"] ?? [],
    comment.tags["see"] ?? [],
    comment.tags
  )
}

const shouldIgnore = (doc: Domain.Doc): boolean => {
  return Record.has(doc.tags, "internal") || Record.has(doc.tags, "ignore")
}

const parseInterfaceDeclaration = (id: ast.InterfaceDeclaration) =>
  Effect.gen(function*() {
    const doc = parseDoc(getJSDocText(id.getJsDocs()))
    if (shouldIgnore(doc)) {
      return []
    }
    const name = id.getName()
    const signature = id.getText()
    const position = yield* parsePosition(id)
    return [
      new Domain.Interface(
        name,
        doc,
        signature,
        position
      )
    ]
  })

const parseInterfaceDeclarations = (interfaces: ReadonlyArray<ast.InterfaceDeclaration>) => {
  const exportedInterfaces = Array.filter(
    interfaces,
    (id) => id.isExported()
  )
  return Effect.forEach(exportedInterfaces, parseInterfaceDeclaration).pipe(Effect.map(Array.flatten))
}

/**
 * Parses exported interfaces from the current source file.
 *
 * @category parsing
 * @since 0.6.0
 */
export const parseInterfaces = Effect.flatMap(
  Source,
  (source) => parseInterfaceDeclarations(source.sourceFile.getInterfaces())
)

const getTypeText = (node: ast.Node) =>
  node.getType().getText(
    node,
    ast.ts.TypeFormatFlags.NoTruncation
      | ast.ts.TypeFormatFlags.WriteArrayAsGenericType
      | ast.ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
      | ast.ts.TypeFormatFlags.NoTypeReduction
      | ast.ts.TypeFormatFlags.AllowUniqueESSymbolType
      | ast.ts.TypeFormatFlags.WriteArrowStyleSignature
  )

const parseType = (node: ast.Node) => {
  let text = getTypeText(node)
  for (const property of node.getDescendantsOfKind(ast.ts.SyntaxKind.PropertySignature)) {
    if (!shouldIgnore(parseDoc(getJSDocText(property.getJsDocs())))) continue
    const readonly = property.getFirstModifierByKind(ast.ts.SyntaxKind.ReadonlyKeyword) ? "readonly " : ""
    const optional = property.hasQuestionToken() ? "?" : ""
    const type = property.getTypeNode()?.getText() ?? getTypeText(property)
    const signature = `${readonly}${property.getName()}${optional}: ${type}`
    text = text
      .replaceAll(`; ${signature}`, "")
      .replaceAll(`${signature}; `, "")
      .replaceAll(signature, "")
  }
  return text
}

const getFunctionDeclarationJSDocs = (fd: ast.FunctionDeclaration): Array<ast.JSDoc> =>
  Array.matchLeft(fd.getOverloads(), {
    onEmpty: () => fd.getJsDocs(),
    onNonEmpty: (firstOverload) => firstOverload.getJsDocs()
  })

const parsePosition = (node: ast.Node): Effect.Effect<Domain.Position, never, Source> => {
  return Effect.gen(function*() {
    const source = yield* Source
    const startPos = node.getStart()
    const position = source.sourceFile.getLineAndColumnAtPos(startPos)
    return position
  })
}

const parseFunctionDeclaration = (fd: ast.FunctionDeclaration) =>
  Effect.gen(function*() {
    const doc = parseDoc(getJSDocText(getFunctionDeclarationJSDocs(fd)))
    if (shouldIgnore(doc)) {
      return []
    }
    const name = fd.getName()
    const type = parseType(fd)
    const signature = `declare const ${name}: ${type}`
    const position = yield* parsePosition(fd)
    return [
      new Domain.Function(
        name ?? "",
        doc,
        signature,
        position
      )
    ]
  })

const parseFunctionVariableDeclaration = (vd: ast.VariableDeclaration) =>
  Effect.gen(function*() {
    const vs: any = vd.getParent().getParent()
    const doc = parseDoc(getJSDocText(vs.getJsDocs()))
    if (shouldIgnore(doc)) {
      return []
    }
    const name = vd.getName()
    const type = parseType(vd)
    const signature = `declare const ${name}: ${type}`
    const startPos = vd.getStart()
    const source = yield* Source
    const position = source.sourceFile.getLineAndColumnAtPos(startPos)
    return [
      new Domain.Function(
        name ?? "",
        doc,
        signature,
        position
      )
    ]
  })

const getFunctionDeclarations = Effect.gen(function*() {
  const source = yield* Source
  const functions = Array.filter(
    source.sourceFile.getFunctions(),
    (fd) => fd.isExported()
  )
  const arrows = pipe(
    Array.filter(
      source.sourceFile.getVariableDeclarations(),
      (vd) => {
        if (isVariableDeclarationList(vd.getParent())) {
          const vs: any = vd.getParent().getParent()
          if (isVariableStatement(vs)) {
            return vs.isExported() &&
              Option.fromNullishOr(vd.getInitializer()).pipe(
                Option.filter((expr) => ast.Node.isFunctionLikeDeclaration(expr)),
                Option.isSome
              )
          }
        }
        return false
      }
    )
  )
  return { functions, arrows }
})

/**
 * Parses exported function declarations and function-valued variables.
 *
 * @category parsing
 * @since 0.6.0
 */
export const parseFunctions = Effect.gen(function*() {
  const { arrows, functions } = yield* getFunctionDeclarations
  const functionDeclarations = yield* Effect.forEach(functions, parseFunctionDeclaration).pipe(
    Effect.map(Array.flatten)
  )
  const functionVariableDeclarations = yield* Effect.forEach(arrows, parseFunctionVariableDeclaration).pipe(
    Effect.map(Array.flatten)
  )
  return [...functionDeclarations, ...functionVariableDeclarations]
})

const parseTypeAliasDeclaration = (ta: ast.TypeAliasDeclaration) =>
  Effect.gen(function*() {
    const doc = parseDoc(getJSDocText(ta.getJsDocs()))
    if (shouldIgnore(doc)) {
      return []
    }
    const name = ta.getName()
    const typeParameters = ta.getTypeParameters().map((parameter) => parameter.getText()).join(", ")
    const definition = ta.getTypeNode()?.getText()
    const signature = `type ${name}${typeParameters.length > 0 ? `<${typeParameters}>` : ""} = ${definition}`
    const position = yield* parsePosition(ta)
    return [
      new Domain.TypeAlias(
        name,
        doc,
        signature,
        position
      )
    ]
  })

const parseTypeAliasDeclarations = (typeAliases: ReadonlyArray<ast.TypeAliasDeclaration>) => {
  const exportedTypeAliases = Array.filter(
    typeAliases,
    (tad) => tad.isExported()
  )
  return Effect.forEach(exportedTypeAliases, parseTypeAliasDeclaration).pipe(Effect.map(Array.flatten))
}

/**
 * Parses exported type aliases from the current source file.
 *
 * @category parsing
 * @since 0.6.0
 */
export const parseTypeAliases = Effect.flatMap(
  Source,
  (source) => parseTypeAliasDeclarations(source.sourceFile.getTypeAliases())
)

const parseConstantVariableDeclaration = (vd: ast.VariableDeclaration) =>
  Effect.gen(function*() {
    const vs: any = vd.getParent().getParent()
    const doc = parseDoc(getJSDocText(vs.getJsDocs()))
    if (shouldIgnore(doc)) {
      return []
    }
    const name = vd.getName()
    const type = parseType(vd)
    const signature = `declare const ${name}: ${type}`
    const position = yield* parsePosition(vd)
    return [
      new Domain.Constant(
        name,
        doc,
        signature,
        position
      )
    ]
  })

/**
 * Parses exported non-function constants from the current source file.
 *
 * @category parsing
 * @since 0.6.0
 */
export const parseConstants = Effect.gen(function*() {
  const source = yield* Source
  const variableDeclarations = pipe(
    Array.filter(
      source.sourceFile.getVariableDeclarations(),
      (vd) => {
        if (isVariableDeclarationList(vd.getParent())) {
          const vs: any = vd.getParent().getParent()
          if (isVariableStatement(vs)) {
            return vs.isExported() &&
              Option.fromNullishOr(vd.getInitializer()).pipe(
                Option.filter((expr) => !ast.Node.isFunctionLikeDeclaration(expr)),
                Option.isSome
              )
          }
        }
        return false
      }
    )
  )
  return yield* Effect.forEach(variableDeclarations, parseConstantVariableDeclaration).pipe(
    Effect.map(Array.flatten)
  )
})

const parseExportSpecifier = (es: ast.ExportSpecifier) =>
  Effect.gen(function*() {
    const name = es.compilerNode.name.text
    const type = parseType(es)
    const oDocComment = getDocComment(es.getLeadingCommentRanges())
    const doc = Option.isSome(oDocComment) ? parseDoc(oDocComment.value.getText()) : parseDoc("")
    const signature = `declare const ${name}: ${type}`
    const position = yield* parsePosition(es)
    return new Domain.Export(
      name,
      doc,
      signature,
      position,
      false
    )
  })

const parseExportStar = (ed: ast.ExportDeclaration) =>
  Effect.gen(function*() {
    const es = ed.getModuleSpecifier()!
    const name = es.getText()
    const namespace = ed.getNamespaceExport()?.getName()
    const signature = `export *${namespace === undefined ? "" : ` as ${namespace}`} from ${name}`
    const oDocComment = getDocComment(ed.getLeadingCommentRanges())
    const doc = Option.isSome(oDocComment) ? parseDoc(oDocComment.value.getText()) : parseDoc("")
    const position = yield* parsePosition(ed)
    return new Domain.Export(
      namespace ?? name,
      doc.modifyDescription(
        `Re-exports all named exports from the ${name} module${namespace === undefined ? "" : ` as \`${namespace}\``}.`
      ),
      signature,
      position,
      true
    )
  })

const parseNamedExports = (ed: ast.ExportDeclaration) => {
  const namedExports = ed.getNamedExports()
  if (namedExports.length === 0) {
    if (ed.getModuleSpecifier() !== undefined) {
      return parseExportStar(ed).pipe(Effect.map(Array.of))
    }
    return Effect.succeed([])
  }
  return Effect.forEach(namedExports, parseExportSpecifier)
}

/**
 * Parses explicit export declarations from the current source file.
 *
 * @category parsing
 * @since 0.6.0
 */
export const parseExports = pipe(
  Effect.map(Source, (source) => source.sourceFile.getExportDeclarations()),
  Effect.flatMap((exportDeclarations) => Effect.forEach(exportDeclarations, parseNamedExports)),
  Effect.map(Array.flatten)
)

const parseModuleDeclaration = (
  ed: ast.ModuleDeclaration
): Effect.Effect<Array<Domain.Namespace>, never, Source | Configuration.Configuration> => {
  const doc = parseDoc(getJSDocText(ed.getJsDocs()))
  if (shouldIgnore(doc)) {
    return Effect.succeed([])
  }
  const name = ed.getName()
  const getInterfaces = parseInterfaceDeclarations(ed.getInterfaces())
  const getTypeAliases = parseTypeAliasDeclarations(ed.getTypeAliases())
  const getNamespaces = parseModuleDeclarations(ed.getModules())
  return Effect.gen(function*() {
    const interfaces = yield* getInterfaces
    const typeAliases = yield* getTypeAliases
    const namespaces = yield* getNamespaces
    const position = yield* parsePosition(ed)
    return [
      new Domain.Namespace(
        name,
        doc,
        position,
        interfaces,
        typeAliases,
        namespaces
      )
    ]
  })
}

const parseModuleDeclarations = (namespaces: ReadonlyArray<ast.ModuleDeclaration>) => {
  return Effect.forEach(
    namespaces.filter((md) => md.isExported()),
    parseModuleDeclaration
  ).pipe(Effect.map(Array.flatten))
}

/**
 * Parses exported namespaces from the current source file.
 *
 * @category parsing
 * @since 0.6.0
 */
export const parseNamespaces = Effect.gen(function*() {
  const source = yield* Source
  return yield* parseModuleDeclarations(source.sourceFile.getModules())
})

const getTypeParameters = (tps: ReadonlyArray<ast.TypeParameterDeclaration>): string =>
  tps.length === 0 ? "" : `<${tps.map((p) => p.getName()).join(", ")}>`

const parseMethod = (md: ast.MethodDeclaration) =>
  Effect.gen(function*() {
    const name = md.getName()
    const jsdocs = Array.matchLeft(md.getOverloads(), {
      onEmpty: () => md.getJsDocs(),
      onNonEmpty: (head) => head.getJsDocs()
    })
    const doc = parseDoc(getJSDocText(jsdocs))
    if (shouldIgnore(doc)) {
      return Option.none()
    }
    const type = parseType(md)
    const signature = `declare const ${name}: ${type}`
    const position = yield* parsePosition(md)
    return Option.some(
      new Domain.DocEntry(
        name,
        doc,
        signature,
        position
      )
    )
  })

const parseProperty = (pd: ast.PropertyDeclaration) =>
  Effect.gen(function*() {
    const doc = parseDoc(getJSDocText(pd.getJsDocs()))
    if (shouldIgnore(doc)) {
      return []
    }
    const name = pd.getName()
    const type = parseType(pd)
    const readonly = pipe(
      Option.fromNullishOr(pd.getFirstModifierByKind(ast.ts.SyntaxKind.ReadonlyKeyword)),
      Option.match({
        onNone: () => "",
        onSome: () => "readonly "
      })
    )
    const signature = `${readonly}${name}: ${type}`
    const position = yield* parsePosition(pd)
    return [
      new Domain.DocEntry(
        name,
        doc,
        signature,
        position
      )
    ]
  })

const parseProperties = (c: ast.ClassDeclaration) => {
  const properties = Array.filter(
    c.getProperties(),
    (pd) =>
      !pd.isStatic() && pipe(
        pd.getFirstModifierByKind(ast.ts.SyntaxKind.PrivateKeyword),
        Option.fromNullishOr,
        Option.isNone
      )
  )
  return Effect.forEach(properties, parseProperty).pipe(Effect.map(Array.flatten))
}

/**
 * @internal
 */
export const getConstructorDeclarationSignature = (
  c: ast.ConstructorDeclaration
): string =>
  pipe(
    Option.fromNullishOr(c.compilerNode.body),
    Option.match({
      onNone: () => c.getText(),
      onSome: (body) => {
        const end = body.getStart() - c.getStart() - 1
        return c.getText().substring(0, end)
      }
    })
  )

const getClassDeclarationSignature = (c: ast.ClassDeclaration) => {
  const name = c.getName() ?? ""
  return pipe(
    Effect.succeed(getTypeParameters(c.getTypeParameters())),
    Effect.map((typeParameters) =>
      pipe(
        c.getConstructors(),
        Array.matchLeft({
          onEmpty: () => `declare class ${name}${typeParameters}`,
          onNonEmpty: (head) =>
            `declare class ${name}${typeParameters} { ${
              getConstructorDeclarationSignature(
                head
              )
            } }`
        })
      )
    )
  )
}

const parseClass = (c: ast.ClassDeclaration) =>
  Effect.gen(function*() {
    const doc = parseDoc(getJSDocText(c.getJsDocs()))
    if (shouldIgnore(doc)) {
      return []
    }
    const name = c.getName() ?? ""
    const signature = yield* getClassDeclarationSignature(c)
    const methods = yield* pipe(
      c.getInstanceMethods(),
      Effect.forEach(parseMethod),
      Effect.map(Array.getSomes)
    )
    const staticMethods = yield* pipe(
      c.getStaticMethods(),
      Effect.forEach(parseMethod),
      Effect.map(Array.getSomes)
    )
    const properties = yield* parseProperties(c)
    const position = yield* parsePosition(c)
    return [
      new Domain.Class(
        name,
        doc,
        signature,
        position,
        methods,
        staticMethods,
        properties
      )
    ]
  })

/**
 * Parses exported classes and their documented members from the current source file.
 *
 * @category parsing
 * @since 0.6.0
 */
export const parseClasses = Effect.gen(function*() {
  const source = yield* Source
  const exportedClasses = source.sourceFile.getClasses().filter((cd) => cd.isExported())
  return yield* Effect.forEach(exportedClasses, parseClass).pipe(Effect.map(Array.flatten))
})

/**
 * @internal
 */
export const parseModuleDocumentation = Effect.gen(function*() {
  const source = yield* Source
  const statements = source.sourceFile.getStatements()
  const ofirstStatement = Array.head(statements)
  if (Option.isSome(ofirstStatement)) {
    const oDocComment = getDocComment(ofirstStatement.value.getLeadingCommentRanges())
    if (Option.isSome(oDocComment)) {
      return parseDoc(oDocComment.value.getText())
    }
  }
  return parseDoc("")
})

/**
 * Parses the current source file into a module documentation model.
 *
 * @category parsing
 * @since 0.6.0
 */
export const parseModule = Effect.gen(function*() {
  const source = yield* Source
  const doc = yield* parseModuleDocumentation
  const interfaces = yield* parseInterfaces
  const functions = yield* parseFunctions
  const typeAliases = yield* parseTypeAliases
  const classes = yield* parseClasses
  const constants = yield* parseConstants
  const exports = yield* parseExports
  const namespaces = yield* parseNamespaces
  const name = source.sourceFile.getBaseName()
  return new Domain.Module(
    source,
    name,
    doc,
    source.path,
    classes,
    interfaces,
    functions,
    typeAliases,
    constants,
    exports,
    namespaces
  )
})

/**
 * @internal
 */
export const parseFile =
  (project: ast.Project) =>
  (file: Domain.File): Effect.Effect<Domain.Module, Array<string>, Configuration.Configuration | Path.Path> => {
    return Effect.gen(function*() {
      const path = yield* Path.Path
      const sourceFile = project.getSourceFile(file.path)
      const filePath = file.path.split(path.sep)
      if (sourceFile !== undefined && Array.isArrayNonEmpty(filePath)) {
        return yield* Effect.provideService(parseModule, Source, { sourceFile, path: filePath })
      }
      return yield* Effect.fail([`Unable to locate file: ${file.path}`])
    })
  }

const createProject = (files: ReadonlyArray<Domain.File>) =>
  Effect.gen(function*() {
    const config = yield* Configuration.Configuration
    const process = yield* Domain.Process
    const cwd = yield* process.cwd
    // Convert the raw config into a format that TS/TS-Morph expects
    const parsed = ast.ts.parseJsonConfigFileContent(
      {
        compilerOptions: {
          strict: true,
          moduleResolution: "node",
          ...config.parseCompilerOptions
        }
      },
      ast.ts.sys,
      cwd
    )

    const options: ast.ProjectOptions = {
      compilerOptions: parsed.options
    }
    const project = new ast.Project(options)
    for (const file of files) {
      project.addSourceFileAtPath(file.path)
    }
    return project
  })

/**
 * Parses source files into module documentation models sorted by path.
 *
 * @category parsing
 * @since 0.6.0
 */
export const parseFiles = (files: ReadonlyArray<Domain.File>) =>
  createProject(files).pipe(
    Effect.flatMap((project) =>
      pipe(
        files,
        Effect.validate(parseFile(project)),
        Effect.map(sortModulesByPath)
      )
    )
  )
