/* eslint-disable @typescript-eslint/no-empty-function */

/**
 * Copyright 2021 Remix Software Inc.
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

/**
 * @see https://github.com/remix-run/remix/blob/0bcb4a304dd2f08f6032c3bf0c3aa7eb5b976901/packages/remix-node/upload/fileUploadHandler.ts
 */
import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, statSync } from 'node:fs';
import { mkdir, rm, stat as statAsync, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, resolve as resolvePath } from 'node:path';
import { finished, Readable } from 'node:stream';
import { promisify } from 'node:util';
import { streamSlice } from './streamSlice';
import type { UploadHandler } from './uploadHandler';
import { MaxPartSizeExceededError } from './uploadHandler';

export async function readableStreamToString(
  stream: ReadableStream<Uint8Array>,
  encoding?: BufferEncoding,
) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  async function read() {
    const { done, value } = await reader.read();

    if (done) {
      return;
    } else if (value) {
      chunks.push(value);
    }

    await read();
  }

  await read();

  return Buffer.concat(chunks).toString(encoding);
}

export type FileUploadHandlerFilterArgs = {
  filename: string;
  contentType: string;
  name: string;
};

export type FileUploadHandlerPathResolverArgs = {
  filename: string;
  contentType: string;
  name: string;
};

/**
 * Chooses the path of the file to be uploaded. If a string is not
 * returned the file will not be written.
 */
export type FileUploadHandlerPathResolver = (
  args: FileUploadHandlerPathResolverArgs,
) => string | undefined;

export type FileUploadHandlerOptions = {
  /**
   * Avoid file conflicts by appending a count on the end of the filename
   * if it already exists on disk. Defaults to `true`.
   */
  avoidFileConflicts?: boolean;
  /**
   * The directory to write the upload.
   */
  directory?: FileUploadHandlerPathResolver | string;
  /**
   * The name of the file in the directory. Can be a relative path, the directory
   * structure will be created if it does not exist.
   */
  file?: FileUploadHandlerPathResolver;
  /**
   * The maximum upload size allowed. If the size is exceeded an error will be thrown.
   * Defaults to 3000000B (3MB).
   */
  maxPartSize?: number;
  /**
   *
   * @param filename
   * @param contentType
   * @param name
   */
  filter?(args: FileUploadHandlerFilterArgs): Promise<boolean> | boolean;
};

const defaultFilePathResolver: FileUploadHandlerPathResolver = ({
  filename,
}) => {
  const ext = filename ? extname(filename) : '';
  return 'upload_' + randomBytes(4).readUInt32LE(0) + ext;
};

async function uniqueFile(filepath: string) {
  const ext = extname(filepath);
  let uniqueFilepath = filepath;

  for (
    let i = 1;
    await statAsync(uniqueFilepath)
      .then(() => true)
      .catch(() => false);
    i++
  ) {
    uniqueFilepath =
      (ext ? filepath.slice(0, -ext.length) : filepath) +
      `-${new Date().getTime()}${ext}`;
  }

  return uniqueFilepath;
}

export function createFileUploadHandler({
  directory = tmpdir(),
  avoidFileConflicts = true,
  file = defaultFilePathResolver,
  filter,
  maxPartSize = 3000000,
}: FileUploadHandlerOptions = {}): UploadHandler {
  return async ({ name, filename, contentType, data }) => {
    if (
      !filename ||
      (filter && !(await filter({ name, filename, contentType })))
    ) {
      return undefined;
    }

    const dir =
      typeof directory === 'string'
        ? directory
        : directory({ name, filename, contentType });

    if (!dir) {
      return undefined;
    }

    const filedir = resolvePath(dir);
    const path =
      typeof file === 'string' ? file : file({ name, filename, contentType });

    if (!path) {
      return undefined;
    }

    let filepath = resolvePath(filedir, path);

    if (avoidFileConflicts) {
      filepath = await uniqueFile(filepath);
    }

    await mkdir(dirname(filepath), { recursive: true }).catch(() => {});

    const writeFileStream = createWriteStream(filepath);
    let size = 0;
    let deleteFile = false;
    try {
      for await (const chunk of data) {
        size += chunk.byteLength;
        if (size > maxPartSize) {
          deleteFile = true;
          throw new MaxPartSizeExceededError(name, maxPartSize);
        }
        writeFileStream.write(chunk);
      }
    } finally {
      writeFileStream.end();
      await promisify(finished)(writeFileStream);

      if (deleteFile) {
        await rm(filepath).catch(() => {});
      }
    }

    return new NodeOnDiskFile(filepath, contentType);
  };
}

export class NodeOnDiskFile {
  name: string;
  lastModified = 0;
  webkitRelativePath = '';

  constructor(
    private filepath: string,
    public type: string,
    private slicer?: { start: number; end: number },
  ) {
    this.name = basename(filepath);
  }

  get size(): number {
    const stats = statSync(this.filepath);

    if (this.slicer) {
      const slice = this.slicer.end - this.slicer.start;
      return slice < 0 ? 0 : slice > stats.size ? stats.size : slice;
    }

    return stats.size;
  }

  slice(start?: number, end?: number, type?: string): NodeOnDiskFile {
    if (typeof start === 'number' && start < 0) start = this.size + start;
    if (typeof end === 'number' && end < 0) end = this.size + end;

    const startOffset = this.slicer?.start ?? 0;

    start = startOffset + (start ?? 0);
    end = startOffset + (end ?? this.size);
    return new NodeOnDiskFile(
      this.filepath,
      typeof type === 'string' ? type : this.type,
      {
        start,
        end,
      },
    );
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    let stream: Readable = createReadStream(this.filepath);
    if (this.slicer) {
      stream = stream.pipe(streamSlice(this.slicer.start, this.slicer.end));
    }

    return new Promise((resolve, reject) => {
      const buf: any[] = [];
      stream.on('data', (chunk) => buf.push(chunk));
      stream.on('end', () => {
        resolve(Buffer.concat(buf));
      });
      stream.on('error', (err) => {
        reject(err);
      });
    });
  }

  stream(): ReadableStream<any>;
  stream(): NodeJS.ReadableStream;
  stream(): NodeJS.ReadableStream | ReadableStream<any> {
    let stream: Readable = createReadStream(this.filepath);
    if (this.slicer) {
      stream = stream.pipe(streamSlice(this.slicer.start, this.slicer.end));
    }

    return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
  }

  async text(): Promise<string> {
    return readableStreamToString(this.stream());
  }

  public readonly [Symbol.toStringTag] = 'File';

  remove(): Promise<void> {
    return unlink(this.filepath);
  }
  getFilePath(): string {
    return this.filepath;
  }
}
