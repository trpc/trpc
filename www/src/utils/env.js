// @ts-check
/* eslint-disable @typescript-eslint/no-var-requires */
const { z } = require('zod');

/**
 * @param {unknown} input
 */
function parseEnv(input) {
  const envSchema = z.object({
    VERCEL_URL: z
      .string()
      .transform((url) => (!url.startsWith('http') ? `https://${url}` : url))
      .default('http://localhost:3000'),
    VERCEL_ENV: z
      .enum(['production', 'preview', 'development'])
      .default('development'),
    VERCEL_GIT_COMMIT_REF: z.string().default('n/a'),
  });

  const env = envSchema.parse(input);

  function getOG_URL() {
    switch (env.VERCEL_ENV) {
      case 'production':
        return 'https://og-image.trpc.io';
      case 'preview':
        return `https://og-image-git-${env.VERCEL_GIT_COMMIT_REF}-trpc.vercel.app`;
      case 'development':
        return 'http://localhost:3001';
      default:
        throw new Error("Can't happen");
    }
  }

  const OG_URL = getOG_URL();
  // console.log({ OG_URL });
  return {
    ...env,
    OG_URL,
  };
}

module.exports = {
  parseEnv,
};
