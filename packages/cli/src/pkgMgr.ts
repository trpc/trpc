export const getPkgMgr = () => {
  const userAgent = process.env.npm_config_user_agent;
  if (userAgent?.startsWith('yarn')) {
    return 'yarn';
  } else if (userAgent?.startsWith('pnpm')) {
    return 'pnpm';
  }
  return 'npm';
};
