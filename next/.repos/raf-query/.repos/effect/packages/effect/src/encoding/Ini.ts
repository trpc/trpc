/**
 * Parses INI configuration files.
 *
 * This module contains the decoding surface used by Effect's CLI without
 * pulling in the complete `ini` package.
 *
 * @stability unstable
 * @since 4.0.0
 */

/*
 * The parser is adapted from `ini` 7.0.0.
 *
 * Copyright (c) Isaac Z. Schlueter and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

const hasOwn = Object.prototype.hasOwnProperty

const splitSections = (value: string): Array<string> => {
  const sections: Array<string> = []
  let start = 0
  let index = 0
  while ((index = value.indexOf(".", index)) !== -1) {
    if (index === 0 || value[index - 1] !== "\\") {
      sections.push(value.slice(start, index))
      start = index + 1
    }
    index++
  }
  sections.push(value.slice(start))
  return sections
}

const isQuoted = (value: string): boolean =>
  value.length >= 2 &&
  ((value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'")))

const unquote = (input: string | undefined): string => {
  let value = (input ?? "").trim()
  if (isQuoted(value)) {
    if (value[0] === "'") {
      value = value.slice(1, -1)
    }
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }

  let escaped = false
  let output = ""
  for (const character of value) {
    if (escaped) {
      output += character === ";" || character === "#" || character === "\\"
        ? character
        : `\\${character}`
      escaped = false
    } else if (character === ";" || character === "#") {
      break
    } else if (character === "\\") {
      escaped = true
    } else {
      output += character
    }
  }
  return output.trim()
}

/**
 * Parses an INI document into a null-prototype record.
 *
 * **Details**
 *
 * Section names separated by dots become nested records, repeated keys ending
 * in `[]` become arrays, and the scalar values `true`, `false`, and `null` are
 * decoded. Other scalar values remain strings.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const parse = (input: string): Record<string, unknown> => {
  const output: Record<string, any> = Object.create(null)
  let current = output
  const sectionPattern = /^\[([^\]]*)\]\s*$/
  const propertyPattern = /^([^=]+)(=(.*))?$/

  for (const line of input.split(/[\r\n]+/g)) {
    if (line.length === 0 || /^\s*(?:[;#]|$)/.test(line)) {
      continue
    }

    const sectionMatch = sectionPattern.exec(line)
    if (sectionMatch !== null) {
      const section = unquote(sectionMatch[1])
      if (section === "__proto__") {
        current = Object.create(null)
      } else {
        current = output[section] ??= Object.create(null)
      }
      continue
    }

    const propertyMatch = propertyPattern.exec(line)
    if (propertyMatch === null) {
      continue
    }

    const rawKey = unquote(propertyMatch[1])
    const array = rawKey.length > 2 && rawKey.endsWith("[]")
    const key = array ? rawKey.slice(0, -2) : rawKey
    if (key === "__proto__") {
      continue
    }

    const rawValue = propertyMatch[2] === undefined ? true : unquote(propertyMatch[3])
    const value = rawValue === "true" || rawValue === "false" || rawValue === "null"
      ? JSON.parse(rawValue)
      : rawValue

    if (array) {
      if (!hasOwn.call(current, key)) {
        current[key] = []
      } else if (!Array.isArray(current[key])) {
        current[key] = [current[key]]
      }
    }
    if (Array.isArray(current[key])) {
      current[key].push(value)
    } else {
      current[key] = value
    }
  }

  const remove: Array<string> = []
  for (const section of Object.keys(output)) {
    if (typeof output[section] !== "object" || output[section] === null || Array.isArray(output[section])) {
      continue
    }

    const parts = splitSections(section)
    const last = parts.pop()!
    const key = last.replace(/\\\./g, ".")
    current = output
    for (const part of parts) {
      if (part === "__proto__") {
        continue
      }
      if (!hasOwn.call(current, part) || typeof current[part] !== "object" || current[part] === null) {
        current[part] = Object.create(null)
      }
      current = current[part]
    }
    if (current === output && key === last) {
      continue
    }
    current[key] = output[section]
    remove.push(section)
  }
  for (const section of remove) {
    delete output[section]
  }
  return output
}
