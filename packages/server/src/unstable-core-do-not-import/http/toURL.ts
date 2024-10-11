import { TRPCError } from '../error/TRPCError';

export function toURL(urlOrPathname: string): URL {
  try {
    const url = urlOrPathname.startsWith('/')
      ? `http://127.0.0.1${urlOrPathname}`
      : urlOrPathname;

    return new URL(url);
  } catch (cause) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Invalid URL',
      cause,
    });
  }
}
