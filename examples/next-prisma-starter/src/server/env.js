// @ts-check
/* eslint-disable @typescript-eslint/no-var-requires */
// This file is included in `next.config.js` which doesn't support `import`-statements
// (TypeScript inference from zod will still work)
const { z } = require('zod');
require('dotenv').config();

if (!process.env.APP_URL) {
  process.env.APP_URL = process.env.NEXTAUTH_URL;
}

/*eslint sort-keys: "error"*/
const envSchema = z.object({
  APP_URL: z.string().url(),
});

const env = envSchema.safeParse(process.env);

if (!env.success) {
  console.error(
    '❌ Environment variables malformatted:',
    JSON.stringify(env.error.format(), null, 4),
  );
  process.exit(1);
}
module.exports.env = env.data;
