import { Readable } from 'stream';
import { z } from 'zod';

export const zodFileStream = z.object({
  file: z.instanceof(Readable),
  filename: z.string(),
  mimeType: z.string(),
});

export const zodFile = zodFileStream.transform(
  async ({ file, filename, mimeType }, ctx) => {
    const chunks: Buffer[] = [];
    for await (const chunk of file) {
      chunks.push(chunk);
    }

    return new File(chunks, filename, {
      type: mimeType,
    });
  },
);
