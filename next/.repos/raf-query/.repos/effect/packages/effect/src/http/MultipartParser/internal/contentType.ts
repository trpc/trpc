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
  /; *([!#$%&'*+.^\w`|~-]+)=("(?:[\v\u0020\u0021\u0023-\u005b\u005d-\u007e\u0080-\u{10ffff}]|\\[\v\u0020-\u{10ffff}])*"|[!#$%&'*+.^\w`|~-]+) */gu

/**
 * RegExp to match quoted-pair in RFC 7230 sec 3.2.6
 *
 * quoted-pair = "\" ( HTAB / SP / VCHAR / obs-text )
 * obs-text    = %x80-FF
 */
const quotedPairRE = /\\([\v\u0020-\u{10ffff}])/gu

/**
 * RegExp to match type in RFC 7231 sec 3.1.1.1
 *
 * media-type = type "/" subtype
 * type       = token
 * subtype    = token
 */
const mediaTypeRE = /^[!#$%&'*+.^\w|~-]+\/[!#$%&'*+.^\w|~-]+$/u
const mediaTypeRENoSlash = /^[!#$%&'*+.^\w|~-]+$/u

// default ContentType to prevent repeated object creation
const defaultContentType = { value: "", parameters: Object.create(null) }

export function parse(
  header: string | undefined,
  withoutSlash = false
): {
  readonly value: string
  readonly parameters: Record<string, string>
} {
  if (typeof header !== "string") {
    return defaultContentType
  }

  let index = header.indexOf(";")
  const type = index !== -1 ? header.slice(0, index).trim() : header.trim()
  const mediaRE = withoutSlash ? mediaTypeRENoSlash : mediaTypeRE

  if (mediaRE.test(type) === false) {
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

      if (!withoutSlash && quotedPairRE.test(value)) {
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
