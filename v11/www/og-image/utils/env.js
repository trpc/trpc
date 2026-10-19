// @ts-check
/**
 * This file is included in `/next.config.js` which ensures the app isn't built with invalid env vars.
 * It has to be a `.js`-file to be imported there.
 */
/* eslint-disable @typescript-eslint/no-var-requires */
const { z } = require('zod');

/*eslint sort-keys: "error"*/
const envSchema = z.object({
  GITHUB_TOKEN: z.string().min(1),
  // TWITTER_BEARER_TOKEN: z.string().min(1),
});

const env = envSchema.safeParse({
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  // TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN,
});

if (!env.success) {
  console.error(
    '❌ Invalid environment variables. Some OG images will not work. You can put credentials in `./env.local`.',
    JSON.stringify(env.error.format(), null, 4),
  );

  throw new Error('Invalid env vars');
}
module.exports.env = env.data;
