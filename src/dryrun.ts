import { trpc } from '.';
import Axios from 'axios';
type RootRouter = typeof import('./serve').rootRouter;

const run = async () => {
  await new Promise((res) => setTimeout(res, 1000));
  const mySDK = trpc.sdk<RootRouter>({
    url: 'http://localhost:5000/rpc',
    getContext: async () => {
      return { token: 'hello there' };
    },
    handler: async (url, payload) => {
      try {
        const result = await Axios.post(url, payload);
        return result.data;
      } catch (err) {
        console.log(err);
        const resp = err.response;
        console.log(`${resp.status} ${resp.data}`);
      }
    },
  });

  console.log(await mySDK.user.testEndpoint('thisisanid'));
  console.log(await mySDK.user.testEndpoint('thisisanid'));
  console.log(await mySDK.getContext());
  console.log(await mySDK.user.createPost('This is my post!'));
};

run();
