/**
 * @example 'trpc-pr-5821'
 */
const railwayEnv = process.env.RAILWAY_ENVIRONMENT_NAME;
export const railwayPrNumber = railwayEnv?.match(/-pr-(\d+)$/)?.[1];

console.log({
  railwayEnv,
  railwayPrNumber: railwayPrNumber ?? '<none>',
});
