/**
 * Format a batch response as a line-delimited JSON stream
 * that the `unstable_httpBatchStreamLink` can parse:
 *
 * @example
 * ```ts
 * const formatter = getBatchStreamFormatter();
 * res.send(formatter(1, 'response #2'));
 * res.send(formatter(0, 'response #1'));
 * res.send(formatter.end());
 * ```
 *
 * Expected format:
 * ```json
 * {"1":"response #2"
 * ,"0":"response #1"
 * }
 * ```
 */
export function getBatchStreamFormatter() {
  let first = true;
  function format(index: number, string: string) {
    const prefix = first ? '{' : ',';
    first = false;
    return `${prefix}"${index}":${string}\n`;
  }
  format.end = () => '}';
  return format;
}
