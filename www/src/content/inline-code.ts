/**
 * Titles and descriptions are Markdown's inline code and nothing else:
 * `` `t.concat()` `` is code, the rest is text.
 */
const codeSpan = /`([^`]+)`/g;

export interface TextPart {
  readonly code: boolean;
  readonly text: string;
}

/** `text`'s runs of plain text and code, in order. */
export const textParts = (text: string): ReadonlyArray<TextPart> =>
  text
    .split(codeSpan)
    .map((part, index) => ({ code: index % 2 === 1, text: part }))
    .filter((part) => part.text !== '');

/** `text` without its backticks, for meta tags, social cards and plain text. */
export const stripInlineCode = (text: string) =>
  text.replaceAll(codeSpan, '$1');
