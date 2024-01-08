import type { NodeOnDiskFile } from './fileUploadHandler';

/**
 * @see https://github.com/remix-run/remix/blob/0bcb4a304dd2f08f6032c3bf0c3aa7eb5b976901/packages/remix-server-runtime/formData.ts
 */
export type UploadHandlerPart = {
  name: string;
  filename?: string;
  contentType: string;
  data: AsyncIterable<Uint8Array>;
};

export type UploadHandler = (
  part: Required<UploadHandlerPart>,
) => Promise<File | NodeOnDiskFile | null | undefined>;

export function composeUploadHandlers(
  ...handlers: UploadHandler[]
): UploadHandler {
  return async (part) => {
    for (const handler of handlers) {
      const value = await handler(part);
      if (typeof value !== 'undefined' && value !== null) {
        return value;
      }
    }

    return undefined;
  };
}

export class MaxPartSizeExceededError extends Error {
  constructor(public field: string, public maxBytes: number) {
    super(`Field "${field}" exceeded upload size of ${maxBytes} bytes.`);
  }
}

export class MaxBodySizeExceededError extends Error {
  constructor(public maxBytes: number) {
    super(`Body exceeded upload size of ${maxBytes} bytes.`);
  }
}

export type MemoryUploadHandlerFilterArgs = {
  filename?: string;
  contentType: string;
  name: string;
};

export type MemoryUploadHandlerOptions = {
  /**
   * The maximum upload size allowed. If the size is exceeded an error will be thrown.
   * Defaults to 3000000B (3MB).
   */
  maxPartSize?: number;
  /**
   *
   * @param filename
   * @param mimetype
   * @param encoding
   */
  filter?(args: MemoryUploadHandlerFilterArgs): Promise<boolean> | boolean;
};

/**
 * @see
 */
export function createMemoryUploadHandler({
  filter,
  maxPartSize = 3000000,
}: MemoryUploadHandlerOptions = {}): UploadHandler {
  return async ({ filename, contentType, name, data }) => {
    if (filter && !(await filter({ filename, contentType, name }))) {
      return undefined;
    }

    let size = 0;
    const chunks = [];
    for await (const chunk of data) {
      size += chunk.byteLength;
      if (size > maxPartSize) {
        throw new MaxPartSizeExceededError(name, maxPartSize);
      }
      chunks.push(chunk);
    }

    return new File(chunks, filename, { type: contentType });
  };
}
