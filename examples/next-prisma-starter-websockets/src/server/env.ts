import { envsafe, str } from 'envsafe';
export const env = envsafe({
  GITHUB_CLIENT_ID: str(),
  GITHUB_SECRET: str(),
  APP_ENV: str({
    default: process.env.NODE_ENV,
    desc: 'Only used to signal if we are in test mode',
  }),
});
