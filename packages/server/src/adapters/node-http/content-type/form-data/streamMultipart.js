/**
 * https://github.com/web3-storage/multipart-parser
 */

/**
 * @param {string | number | boolean} s
 */
function stringToArray(s) {
  const utf8 = unescape(encodeURIComponent(s));
  return Uint8Array.from(utf8, (_, i) => utf8.charCodeAt(i));
}
/**
 * @param {number[]} a
 */
function arrayToString(a) {
  const utf8 = String.fromCharCode.apply(null, a);
  return decodeURIComponent(escape(utf8));
}
/**
 * @param {Uint8Array[]} arrays
 */
function mergeArrays(...arrays) {
  const out = new Uint8Array(
    arrays.reduce((total, arr) => total + arr.length, 0),
  );
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
}
/**
 * @param {string | any[]} a
 * @param {string | any[] | Uint8Array} b
 */
function arraysEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/*
  Based heavily on the Streaming Boyer-Moore-Horspool C++ implementation
  by Hongli Lai at: https://github.com/FooBarWidget/boyer-moore-horspool
*/
function coerce(a) {
  if (a instanceof Uint8Array) {
    return (index) => a[index];
  }
  // NOTE(julius): for some reason we still get Uint8Array's here
  // whcih causes jsmemcmp to throw
  return a;
}
// eslint-disable-next-line max-params
function jsmemcmp(buf1, pos1, buf2, pos2, len) {
  const fn1 = coerce(buf1);
  const fn2 = coerce(buf2);
  for (let i = 0; i < len; ++i) {
    // NOTE(julius): this try-catch block was not here in original sause
    try {
      if (fn1(pos1 + i) !== fn2(pos2 + i)) {
        return false;
      }
    } catch (e) {
      // no-op
    }
  }
  return true;
}
function createOccurenceTable(s) {
  // Populate occurrence table with analysis of the needle,
  // ignoring last letter.
  const table = new Array(256).fill(s.length);
  if (s.length > 1) {
    for (let i = 0; i < s.length - 1; i++) {
      table[s[i]] = s.length - 1 - i;
    }
  }
  return table;
}
const MATCH = Symbol('Match');
class StreamSearch {
  constructor(needle) {
    this._lookbehind = new Uint8Array();
    if (typeof needle === 'string') {
      this._needle = needle = stringToArray(needle);
    } else {
      this._needle = needle;
    }
    this._lastChar = needle[needle.length - 1];
    this._occ = createOccurenceTable(needle);
  }

  feed(chunk) {
    let pos = 0;
    let tokens;
    const allTokens = [];
    while (pos !== chunk.length) {
      [pos, ...tokens] = this._feed(chunk, pos);
      allTokens.push(...tokens);
    }
    return allTokens;
  }

  end() {
    const tail = this._lookbehind;
    this._lookbehind = new Uint8Array();
    return tail;
  }

  _feed(data, bufPos) {
    const tokens = [];
    // Positive: points to a position in `data`
    //           pos == 3 points to data[3]
    // Negative: points to a position in the lookbehind buffer
    //           pos == -2 points to lookbehind[lookbehind_size - 2]
    let pos = -this._lookbehind.length;
    if (pos < 0) {
      // Lookbehind buffer is not empty. Perform Boyer-Moore-Horspool
      // search with character lookup code that considers both the
      // lookbehind buffer and the current round's haystack data.
      //
      // Loop until (condition 1)
      //   there is a match.
      // or until
      //   we've moved past the position that requires the
      //   lookbehind buffer. In this case we switch to the
      //   optimized loop.
      // or until (condition 3)
      //   the character to look at lies outside the haystack.
      while (pos < 0 && pos <= data.length - this._needle.length) {
        const ch = this._charAt(data, pos + this._needle.length - 1);
        if (
          ch === this._lastChar &&
          this._memcmp(data, pos, this._needle.length - 1)
        ) {
          if (pos > -this._lookbehind.length) {
            tokens.push(
              this._lookbehind.slice(0, this._lookbehind.length + pos),
            );
          }
          tokens.push(MATCH);
          this._lookbehind = new Uint8Array();
          return [pos + this._needle.length, ...tokens];
        } else {
          pos += this._occ[ch];
        }
      }
      // No match.
      if (pos < 0) {
        // There's too little data for Boyer-Moore-Horspool to run,
        // so we'll use a different algorithm to skip as much as
        // we can.
        // Forward pos until
        //   the trailing part of lookbehind + data
        //   looks like the beginning of the needle
        // or until
        //   pos == 0
        while (pos < 0 && !this._memcmp(data, pos, data.length - pos)) {
          pos++;
        }
      }
      if (pos >= 0) {
        // Discard lookbehind buffer.
        tokens.push(this._lookbehind);
        this._lookbehind = new Uint8Array();
      } else {
        // Cut off part of the lookbehind buffer that has
        // been processed and append the entire haystack
        // into it.
        const bytesToCutOff = this._lookbehind.length + pos;
        if (bytesToCutOff > 0) {
          // The cut off data is guaranteed not to contain the needle.
          tokens.push(this._lookbehind.slice(0, bytesToCutOff));
          this._lookbehind = this._lookbehind.slice(bytesToCutOff);
        }
        this._lookbehind = Uint8Array.from(
          new Array(this._lookbehind.length + data.length),
          (_, i) => this._charAt(data, i - this._lookbehind.length),
        );
        return [data.length, ...tokens];
      }
    }
    pos += bufPos;
    // Lookbehind buffer is now empty. Perform Boyer-Moore-Horspool
    // search with optimized character lookup code that only considers
    // the current round's haystack data.
    while (pos <= data.length - this._needle.length) {
      const ch = data[pos + this._needle.length - 1];
      if (
        ch === this._lastChar &&
        data[pos] === this._needle[0] &&
        jsmemcmp(this._needle, 0, data, pos, this._needle.length - 1)
      ) {
        if (pos > bufPos) {
          tokens.push(data.slice(bufPos, pos));
        }
        tokens.push(MATCH);
        return [pos + this._needle.length, ...tokens];
      } else {
        pos += this._occ[ch];
      }
    }
    // There was no match. If there's trailing haystack data that we cannot
    // match yet using the Boyer-Moore-Horspool algorithm (because the trailing
    // data is less than the needle size) then match using a modified
    // algorithm that starts matching from the beginning instead of the end.
    // Whatever trailing data is left after running this algorithm is added to
    // the lookbehind buffer.
    if (pos < data.length) {
      while (
        pos < data.length &&
        (data[pos] !== this._needle[0] ||
          !jsmemcmp(data, pos, this._needle, 0, data.length - pos))
      ) {
        ++pos;
      }
      if (pos < data.length) {
        this._lookbehind = data.slice(pos);
      }
    }
    // Everything until pos is guaranteed not to contain needle data.
    if (pos > 0) {
      tokens.push(data.slice(bufPos, pos < data.length ? pos : data.length));
    }
    return [data.length, ...tokens];
  }

  _charAt(data, pos) {
    if (pos < 0) {
      return this._lookbehind[this._lookbehind.length + pos];
    }
    return data[pos];
  }

  _memcmp(data, pos, len) {
    return jsmemcmp(this._charAt.bind(this, data), pos, this._needle, 0, len);
  }
}

class ReadableStreamSearch {
  constructor(needle, _readableStream) {
    this._readableStream = _readableStream;
    this._search = new StreamSearch(needle);
  }

  async *[Symbol.asyncIterator]() {
    const reader = this._readableStream.getReader();
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) {
          break;
        }
        yield* this._search.feed(result.value);
      }
      const tail = this._search.end();
      if (tail.length) {
        yield tail;
      }
    } finally {
      reader.releaseLock();
    }
  }
}

const mergeArrays2 = Function.prototype.apply.bind(mergeArrays, undefined);
const dash = stringToArray('--');
const CRLF = stringToArray('\r\n');
function parseContentDisposition(header) {
  const parts = header.split(';').map((part) => part.trim());
  if (parts.shift() !== 'form-data') {
    throw new Error(
      'malformed content-disposition header: missing "form-data" in `' +
        JSON.stringify(parts) +
        '`',
    );
  }
  const out = {};
  for (const part of parts) {
    const kv = part.split('=', 2);
    if (kv.length !== 2) {
      throw new Error(
        'malformed content-disposition header: key-value pair not found - ' +
          part +
          ' in `' +
          header +
          '`',
      );
    }
    const [name, value] = kv;
    if (value[0] === '"' && value[value.length - 1] === '"') {
      out[name] = value.slice(1, -1).replace(/\\"/g, '"');
    } else if (value[0] !== '"' && value[value.length - 1] !== '"') {
      out[name] = value;
    } else if (
      (value[0] === '"' && value[value.length - 1] !== '"') ||
      (value[0] !== '"' && value[value.length - 1] === '"')
    ) {
      throw new Error(
        'malformed content-disposition header: mismatched quotations in `' +
          header +
          '`',
      );
    }
  }
  if (!out.name) {
    throw new Error(
      'malformed content-disposition header: missing field name in `' +
        header +
        '`',
    );
  }
  return out;
}
function parsePartHeaders(lines) {
  const entries = [];
  let disposition = false;
  let line;
  while (typeof (line = lines.shift()) !== 'undefined') {
    const colon = line.indexOf(':');
    if (colon === -1) {
      throw new Error('malformed multipart-form header: missing colon');
    }
    const header = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    switch (header) {
      case 'content-disposition':
        disposition = true;
        entries.push(...Object.entries(parseContentDisposition(value)));
        break;
      case 'content-type':
        entries.push(['contentType', value]);
    }
  }
  if (!disposition) {
    throw new Error(
      'malformed multipart-form header: missing content-disposition',
    );
  }
  return Object.fromEntries(entries);
}
async function readHeaderLines(it, needle) {
  let firstChunk = true;
  let lastTokenWasMatch = false;
  const headerLines = [[]];
  const crlfSearch = new StreamSearch(CRLF);
  for (;;) {
    const result = await it.next();
    if (result.done) {
      throw new Error(
        'malformed multipart-form data: unexpected end of stream',
      );
    }
    if (
      firstChunk &&
      result.value !== MATCH &&
      arraysEqual(result.value.slice(0, 2), dash)
    ) {
      // end of multipart payload, beginning of epilogue
      return [undefined, new Uint8Array()];
    }
    let chunk;
    if (result.value !== MATCH) {
      chunk = result.value;
    } else if (!lastTokenWasMatch) {
      chunk = needle;
    } else {
      throw new Error('malformed multipart-form data: unexpected boundary');
    }
    if (!chunk.length) {
      continue;
    }
    if (firstChunk) {
      firstChunk = false;
    }
    const tokens = crlfSearch.feed(chunk);
    for (const [i, token] of tokens.entries()) {
      const isMatch = token === MATCH;
      if (!isMatch && !token.length) {
        continue;
      }
      if (lastTokenWasMatch && isMatch) {
        tokens.push(crlfSearch.end());
        return [
          headerLines
            .filter((chunks) => chunks.length)
            .map(mergeArrays2)
            .map(arrayToString),
          mergeArrays(
            ...tokens
              .slice(i + 1)
              .map((token) => (token === MATCH ? CRLF : token)),
          ),
        ];
      }
      if ((lastTokenWasMatch = isMatch)) {
        headerLines.push([]);
      } else {
        headerLines[headerLines.length - 1].push(token);
      }
    }
  }
}

export async function* streamMultipart(body, boundary) {
  const needle = mergeArrays(dash, stringToArray(boundary));
  const it = new ReadableStreamSearch(needle, body)[Symbol.asyncIterator]();
  // discard prologue
  for (;;) {
    const result = await it.next();
    if (result.done) {
      // EOF
      return;
    }
    if (result.value === MATCH) {
      break;
    }
  }
  const crlfSearch = new StreamSearch(CRLF);
  for (;;) {
    const [headerLines, tail] = await readHeaderLines(it, needle);
    if (!headerLines) {
      return;
    }
    async function nextToken() {
      const result = await it.next();
      if (result.done) {
        throw new Error(
          'malformed multipart-form data: unexpected end of stream',
        );
      }
      return result;
    }
    let trailingCRLF = false;
    function feedChunk(chunk) {
      const chunks = [];
      for (const token of crlfSearch.feed(chunk)) {
        if (trailingCRLF) {
          chunks.push(CRLF);
        }
        if (!(trailingCRLF = token === MATCH)) {
          chunks.push(token);
        }
      }
      return mergeArrays(...chunks);
    }
    let done = false;
    async function nextChunk() {
      const result = await nextToken();
      let chunk;
      if (result.value !== MATCH) {
        chunk = result.value;
      } else if (!trailingCRLF) {
        chunk = CRLF;
      } else {
        done = true;
        return { value: crlfSearch.end() };
      }
      return { value: feedChunk(chunk) };
    }
    const bufferedChunks = [{ value: feedChunk(tail) }];
    yield {
      ...parsePartHeaders(headerLines),
      data: {
        [Symbol.asyncIterator]() {
          return this;
        },
        async next() {
          for (;;) {
            const result = bufferedChunks.shift();
            if (!result) {
              break;
            }
            if (result.value.length > 0) {
              return result;
            }
          }
          for (;;) {
            if (done) {
              return { done, value: undefined };
            }
            const result = await nextChunk();
            if (result.value.length > 0) {
              return result;
            }
          }
        },
      },
    };
    while (!done) {
      bufferedChunks.push(await nextChunk());
    }
  }
}
