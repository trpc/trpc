import { z } from 'zod';
import fs from 'fs';
import { createRouter } from 'server/createRouter';
import path from 'path';
export const sourceRouter = createRouter().query('getSource', {
  input: z.object({
    path: z.string(),
  }),
  async resolve({ input }) {
    const ROOT = path.resolve(__dirname + '/../../../../../src') + '/';
    const contents = fs.readFileSync(ROOT + input.path).toString('utf8');

    return {
      contents,
    };
  },
});
