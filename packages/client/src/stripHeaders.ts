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
 * Strips an HTTP header object of internally reserved keys (for undici/Node.js built-in fetch since v18)
 * @param headers Your HTTP header object
 * @returns Stripped headers without blacklisted keys
 */
export const stripHeaders = (headers: HTTPHeaders): HTTPHeaders =>
  Object.fromEntries(
    // unwrap and re-wrap object to tuple array so we can iterate/map over it
    Object.entries(headers).filter(([k]) => !forbiddenHeaderNames.includes(k)), // filter out all keys `k` which are included in `forbiddenHeaderNames`
  );
