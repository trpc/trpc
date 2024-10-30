// @ts-check
const { z } = require('zod');

const booleanSchema = z
  .enum(['1', '0', 'true', 'false'])
  .transform((str) => ['1', 'true'].includes(str.toLowerCase()));

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
    VERCEL_GIT_COMMIT_REF: z
      .string()
      .default('n/a')
      .transform((ref) => ref.replace('/', '-')),
    TYPEDOC: booleanSchema.default('1'),
  });

  const env = envSchema.parse(input);

  if (!env.TYPEDOC) {
    console.log('ℹ️ℹ️ℹ️ℹ️ℹ️ Skipping typedoc');
  }

  function getOG_URL() {
    switch (env.VERCEL_ENV) {
      case 'production':
      case 'preview':
        return 'https://og-image.trpc.io';
      // FIXME: this gets cached across deployments for some reason
      // case 'preview':
      //   return `https://og-image-git-${env.VERCEL_GIT_COMMIT_REF}-trpc.vercel.app`;
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
