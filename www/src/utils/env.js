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
      .transform((hostname) =>
        hostname.startsWith('http') ? `https://${hostname}` : hostname,
      )
      .default('http://localhost:3000'),
    VERCEL_ENV: z
      .enum(['production', 'preview', 'development'])
      .default('development'),
    VERCEL_GIT_REPO_SLUG: z.string().default('n/a'),
  });

  const env = envSchema.parse(input);

  console.log('input', input);
  console.log('env', env);

  function getOG_URL() {
    switch (env.VERCEL_ENV) {
      case 'production':
        return 'https://og-image.trpc.io';
      case 'preview':
        return `https://og-image-${env.VERCEL_GIT_REPO_SLUG}-trpc.vercel.app`;
      case 'development':
        return 'http://localhost:3001';
    }
  }

  return {
    ...env,
    OG_URL: getOG_URL(),
  };
}

module.exports = {
  parseEnv,
};
