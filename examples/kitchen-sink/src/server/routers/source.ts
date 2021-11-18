import { z } from 'zod';
import fs from 'fs';
import { createRouter } from 'server/createRouter';
import path from 'path';

const sourceFilePath = z.string().refine((val) => !val.includes('..'), {
  message: 'Only relative paths allowed',
});
export const sourceRouter = createRouter()
  .query('getSource', {
    input: z.object({
      path: sourceFilePath,
    }),
    async resolve({ input }) {
      const ROOT = path.resolve(__dirname + '/../../../../../src') + '/';
      const contents = fs.readFileSync(ROOT + input.path).toString('utf8');

      return {
        contents,
      };
    },
  })
  .query('getDefinitions', {
    input: z.object({
      moduleName: sourceFilePath,
      relativeTo: sourceFilePath.nullish(),
    }),
    async resolve({ input }) {
      return {
        definition: '',
      };
    },
  });
