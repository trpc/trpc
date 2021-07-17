import { envsafe, str } from 'envsafe';
export const env = envsafe({
  GITHUB_CLIENT_ID: str({
    devDefault: '832513c5ece0dfa99e82',
  }),
  GITHUB_SECRET: str({
    devDefault: 'a129ccea8efa0e5ad6dd7bde35b74666a1346cb5',
  }),
  APP_ENV: str({
    default: process.env.NODE_ENV,
    desc: 'Only used to signal if we are in test mode',
  }),
});
