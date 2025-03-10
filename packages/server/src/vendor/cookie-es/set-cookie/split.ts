/**
 * Based on https://github.com/unjs/cookie-es/tree/v1.2.2
 * MIT License
 * 
 * Cookie-es copyright (c) Pooya Parsa <pooya@pi0.io>
 * Set-Cookie parsing based on https://github.com/nfriedly/set-cookie-parser
 * Copyright (c) 2015 Nathan Friedly <nathan@nfriedly.com> (http://nfriedly.com/)
 * 
 * @see https://github.com/unjs/cookie-es/blob/main/src/set-cookie/split.ts
 */

/**
 * Set-Cookie header field-values are sometimes comma joined in one string. This splits them without choking on commas
 * that are within a single set-cookie field-value, such as in the Expires portion.
 *
 * See https://tools.ietf.org/html/rfc2616#section-4.2
 */
export function splitSetCookieString(
    cookiesString: string | string[],
  ): string[] {
    if (Array.isArray(cookiesString)) {
      return cookiesString.flatMap((c) => splitSetCookieString(c));
    }
  
    if (typeof cookiesString !== "string") {
      return [];
    }
  
    const cookiesStrings: string[] = [];
    let pos: number = 0;
    let start: number;
    let ch: string;
    let lastComma: number;
    let nextStart: number;
    let cookiesSeparatorFound: boolean;
  
    const skipWhitespace = () => {
      while (pos < cookiesString.length && /\s/.test(cookiesString.charAt(pos))) {
        pos += 1;
      }
      return pos < cookiesString.length;
    };
  
    const notSpecialChar = () => {
      ch = cookiesString.charAt(pos);
      return ch !== "=" && ch !== ";" && ch !== ",";
    };
  
    while (pos < cookiesString.length) {
      start = pos;
      cookiesSeparatorFound = false;
  
      while (skipWhitespace()) {
        ch = cookiesString.charAt(pos);
        if (ch === ",") {
          // ',' is a cookie separator if we have later first '=', not ';' or ','
          lastComma = pos;
          pos += 1;
  
          skipWhitespace();
          nextStart = pos;
  
          while (pos < cookiesString.length && notSpecialChar()) {
            pos += 1;
          }
  
          // currently special character
          if (pos < cookiesString.length && cookiesString.charAt(pos) === "=") {
            // we found cookies separator
            cookiesSeparatorFound = true;
            // pos is inside the next cookie, so back up and return it.
            pos = nextStart;
            cookiesStrings.push(cookiesString.slice(start, lastComma));
            start = pos;
          } else {
            // in param ',' or param separator ';',
            // we continue from that comma
            pos = lastComma + 1;
          }
        } else {
          pos += 1;
        }
      }
  
      if (!cookiesSeparatorFound || pos >= cookiesString.length) {
        cookiesStrings.push(cookiesString.slice(start));
      }
    }
  
    return cookiesStrings;
  }