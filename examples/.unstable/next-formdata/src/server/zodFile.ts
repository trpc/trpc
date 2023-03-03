import { Readable } from 'stream';
import { z } from 'zod';

export const zodFileStream = z.object({
  stream: z.instanceof(Readable),
  name: z.string(),
  type: z.string(),
});

export const zodFile = zodFileStream.transform(async (input, ctx) => {
  const chunks: Buffer[] = [];
  for await (const chunk of input.stream) {
    chunks.push(chunk);
  }

  return new File(chunks, input.name, {
    type: input.type,
  });
});
