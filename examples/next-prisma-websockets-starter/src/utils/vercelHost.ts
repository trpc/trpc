/**
 * On Vercel, the deployment's own host, used instead of the local defaults in `.env`
 */
export const vercelHost =
  process.env.VERCEL_ENV === 'production'
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL
    : process.env.VERCEL_BRANCH_URL;
