// taken from https://github.com/fastify/fast-content-type-parse
// under the MIT license

/**
 * RegExp to match *( ";" parameter ) in RFC 7231 sec 3.1.1.1
 *
 * parameter     = token "=" ( token / quoted-string )
 * token         = 1*tchar
 * tchar         = "!" / "#" / "$" / "%" / "&" / "'" / "*"
 *               / "+" / "-" / "." / "^" / "_" / "`" / "|" / "~"
 *               / DIGIT / ALPHA
 *               ; any VCHAR, except delimiters
 * quoted-string = DQUOTE *( qdtext / quoted-pair ) DQUOTE
 * qdtext        = HTAB / SP / %x21 / %x23-5B / %x5D-7E / obs-text
 * obs-text      = %x80-FF
 * quoted-pair   = "\" ( HTAB / SP / VCHAR / obs-text )
 */
const paramRE =
  /; *([!#$%&'*+.^\w`|~-]+)=("(?:[\t\u0020\u0021\u0023-\u005b\u005d-\u007e\u0080-\u{10ffff}]|\\[\t\u0020-\u{10ffff}])*"|[!#$%&'*+.^\w`|~-]+) */gu

/**
 * RegExp to match *( ";" disposition-parm ) in RFC 6266 sec 4.1, which allows
 * optional whitespace around separators
 */
const dispositionParamRE =
  /;[ \t]*([!#$%&'*+.^\w`|~-]+)[ \t]*=[ \t]*("(?:[\t\u0020\u0021\u0023-\u005b\u005d-\u007e\u0080-\u{10ffff}]|\\[\t\u0020-\u{10ffff}])*"|[!#$%&'*+.^\w`|~-]+)[ \t]*/gu

/**
 * RegExp to match quoted-pair in RFC 7230 sec 3.2.6
 *
 * quoted-pair = "\" ( HTAB / SP / VCHAR / obs-text )
 * obs-text    = %x80-FF
 */
const quotedPairRE = /\\([\t\u0020-\u{10ffff}])/gu

/**
 * RegExp to match type in RFC 7231 sec 3.1.1.1
 *
 * media-type = type "/" subtype
 * type       = token
 * subtype    = token
 */
const mediaTypeRE = /^[!#$%&'*+.^\w|~-]+\/[!#$%&'*+.^\w|~-]+$/u
const dispositionTypeRE = /^[!#$%&'*+.^\w|~-]+$/u

// default ContentType to prevent repeated object creation
const defaultContentType = { value: "", parameters: Object.create(null) }

export function parse(
  header: string | undefined
): {
  readonly value: string
  readonly parameters: Record<string, string>
} {
  if (typeof header !== "string") {
    return defaultContentType
  }

  let index = header.indexOf(";")
  const type = index !== -1 ? header.slice(0, index).trim() : header.trim()

  if (mediaTypeRE.test(type) === false) {
    return defaultContentType
  }

  const result = {
    value: type.toLowerCase(),
    parameters: Object.create(null)
  }

  // parse parameters
  if (index === -1) {
    return result
  }

  let key: string
  let match: RegExpExecArray | null
  let value: string

  paramRE.lastIndex = index

  while ((match = paramRE.exec(header))) {
    if (match.index !== index) {
      return defaultContentType
    }

    index += match[0].length
    key = match[1].toLowerCase()
    value = match[2]

    if (value[0] === "\"") {
      // remove quotes and escapes
      value = value.slice(1, value.length - 1)

      if (quotedPairRE.test(value)) {
        value = value.replace(quotedPairRE, "$1")
      }
    }

    result.parameters[key] = value
  }

  if (index !== header.length) {
    return defaultContentType
  }

  return result
}

// RFC 8187 ext-value: charset "'" [ language ] "'" value-chars
const extValueRE = /^(utf-8|iso-8859-1)'[a-z0-9-]*'((?:%[0-9a-f]{2}|[!#$&+.^_`|~\w-])*)$/i
const pctEncodedRE = /%([0-9a-f]{2})/gi

/**
 * Decodes an RFC 8187 ext-value, returning `undefined` when it is malformed.
 * ISO-8859-1 is decoded byte by byte because `TextDecoder` treats it as
 * windows-1252.
 */
function decodeExtValue(value: string): string | undefined {
  const match = extValueRE.exec(value)
  if (match === null) {
    return undefined
  }
  if (match[1].toLowerCase() === "iso-8859-1") {
    return match[2].replace(pctEncodedRE, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
  }
  try {
    return decodeURIComponent(match[2])
  } catch {
    return undefined
  }
}

export interface ContentDisposition {
  readonly value: string
  readonly parameters: Record<string, string>
  /** `filename*` decoded per RFC 8187, falling back to `filename` */
  readonly filename: string | undefined
}

// default ContentDisposition to prevent repeated object creation
const defaultContentDisposition: ContentDisposition = { ...defaultContentType, filename: undefined }

/**
 * Parses a Content-Disposition header according to RFC 6266, returning
 * `undefined` when it is malformed, repeats a parameter or carries an
 * undecodable `filename*`.
 *
 * Quoted-pairs are left as-is, so unescaped backslashes in file paths survive.
 */
export function parseDisposition(
  header: string | ReadonlyArray<string> | undefined
): ContentDisposition | undefined {
  if (header === undefined) {
    return defaultContentDisposition
  } else if (typeof header !== "string") {
    return undefined
  }

  let index = header.indexOf(";")
  const type = index !== -1 ? header.slice(0, index).trim() : header.trim()

  if (dispositionTypeRE.test(type) === false) {
    return undefined
  }

  const parameters: Record<string, string> = Object.create(null)

  if (index !== -1) {
    let match: RegExpExecArray | null

    dispositionParamRE.lastIndex = index

    while ((match = dispositionParamRE.exec(header))) {
      if (match.index !== index) {
        return undefined
      }

      index += match[0].length
      const key = match[1].toLowerCase()
      const value = match[2]

      if (key in parameters) {
        return undefined
      }

      parameters[key] = value[0] === "\"" ? value.slice(1, value.length - 1) : value
    }

    if (index !== header.length) {
      return undefined
    }
  }

  let filename: string | undefined = parameters.filename
  if ("filename*" in parameters) {
    filename = decodeExtValue(parameters["filename*"])
    if (filename === undefined) {
      return undefined
    }
  }

  return { value: type.toLowerCase(), parameters, filename }
}
