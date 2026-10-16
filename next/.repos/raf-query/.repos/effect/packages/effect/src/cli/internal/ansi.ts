/**
 * Internal ANSI escape sequence helpers used by the unstable CLI rendering
 * implementation. This module centralizes the control codes for text styling,
 * cursor movement, line erasing, and terminal notifications so renderers can
 * compose terminal output without scattering raw escape sequences throughout
 * the CLI internals.
 *
 * The helpers deliberately work with plain strings because terminal rendering
 * is sensitive to ordering: style codes must be reset after annotated text,
 * cursor operations must account for one-based terminal coordinates, and line
 * clearing usually needs to preserve the cursor position expected by the next
 * frame.
 */
const ESC = "\x1B["
const BEL = "\x07"
const SEP = ";"

/**
 * @internal
 */
export const reset = `${ESC}0m`

/**
 * @internal
 */
export const bold = `${ESC}1m`

/**
 * @internal
 */
export const italicized = `${ESC}3m`

/**
 * @internal
 */
export const underlined = `${ESC}4m`

/**
 * @internal
 */
export const strikethrough = `${ESC}9m`

/**
 * @internal
 */
export const cursorShow = `${ESC}?25h`

/**
 * @internal
 */
export const cursorHide = `${ESC}?25l`

/**
 * @internal
 */
export const cursorLeft = `${ESC}G`

/**
 * @internal
 */
export const cursorSavePosition = `${ESC}s`

/**
 * @internal
 */
export const cursorRestorePosition = `${ESC}u`

/**
 * @internal
 */
export const eraseLine = `${ESC}2K`

/**
 * @internal
 */
export const beep = BEL

/**
 * @internal
 */
export const red = `${ESC}31m`

/**
 * @internal
 */
export const green = `${ESC}32m`

/**
 * @internal
 */
export const magenta = `${ESC}35m`

/**
 * @internal
 */
export const white = `${ESC}37m`

/**
 * @internal
 */
export const blackBright = `${ESC}90m`

/**
 * @internal
 */
export const cyanBright = `${ESC}96m`

export const annotate = (text: string, ...styles: Array<string | Array<string>>) => {
  const flat = styles.flat()
  return `${flat.join("")}${text}${reset}`
}

export const combine = (...styles: Array<string>): Array<string> => styles

/**
 * @internal
 */
export const cursorTo = (column: number, row?: number): string => {
  if (row === undefined) {
    return `${ESC}${Math.max(column + 1, 0)}G`
  }
  return `${ESC}${row + 1}${SEP}${Math.max(column + 1, 0)}H`
}

/**
 * @internal
 */
export const cursorDown = (lines: number = 1): string => {
  return `${ESC}${lines}B`
}

/**
 * @internal
 */
export const cursorMove = (column: number, row: number = 0): string => {
  let command = ""
  if (row < 0) {
    command += `${ESC}${-row}A`
  }
  if (row > 0) {
    command += `${ESC}${row}B`
  }
  if (column > 0) {
    command += `${ESC}${column}C`
  }
  if (column < 0) {
    command += `${ESC}${-column}D`
  }

  return command
}

/**
 * @internal
 */
export const eraseLines = (rows: number): string => {
  let command = ""
  for (let i = 0; i < rows; i++) {
    command += `${ESC}2K` + (i < rows - 1 ? `${ESC}1A` : "")
  }
  if (rows > 0) {
    command += `${ESC}G`
  }

  return command
}
