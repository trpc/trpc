import { HTTPHeaders } from './links/core';

// from https://github.com/nodejs/undici/blob/9e5316c8b04a7b35522d0d5b8de71f67fa2a3c34/lib/fetch/constants.js
const forbiddenHeaderNames = [
  'accept-charset',
  'accept-encoding',
  'access-control-request-headers',
  'access-control-request-method',
  'connection',
  'content-length',
  'cookie',
  'cookie2',
  'date',
  'dnt',
  'expect',
  'host',
  'keep-alive',
  'origin',
  'referer',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'via',
];

/**
 * Strips an HTTP header object of internally reserved names (for undici/Node.js built-in fetch since v18)
 * @param headers Your HTTP header object
 * @returns Stripped headers without reservered names
 */
export const stripHeaders = (headers: HTTPHeaders): HTTPHeaders =>
  Object.fromEntries(
    // unwrap and re-wrap object to tuple array so we can iterate/map over it
    // filter out all names which are included in `forbiddenHeaderNames`
    Object.entries(headers).filter(
      ([name]) =>
        !forbiddenHeaderNames.includes(name) &&
        !name.startsWith('sec-') &&
        !name.startsWith('proxy-'),
    ),
  );
