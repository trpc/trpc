// @ts-check
/* eslint-disable @typescript-eslint/no-var-requires */
const { z } = require('zod');

/**
 *
 * @param {unknown} input
 * @returns
 */
function parseEnv(input) {
  const envSchema = z.object({
    VERCEL_URL: z
      .string()
      .transform((hostname) => `https://${hostname}`)
      .optional()
      .default('http://localhost:3000'),
  });

  const env = envSchema.parse(input);

  function getOG_URL() {
    const { VERCEL_URL } = env;

    // if a vercel link
    if (VERCEL_URL.includes('localhost')) {
      return 'http://localhost:3001';
    }
    if (VERCEL_URL.includes('vercel.app')) {
      return VERCEL_URL.replace('www', 'og-image');
    }
    return 'https://og-image.trpc.io';
  }

  return {
    ...env,
    OG_URL: getOG_URL(),
  };
}

module.exports = {
  parseEnv,
};
