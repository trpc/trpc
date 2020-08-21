// type asdf = typeof import('./dryrun').rootRouter;
// import { trpc } from '.';

// const sdk = trpc.sdk<asdf>({
//   url: 'asdf',
//   getContext: async () => ({}),
//   handler(_url, _data) {
//     return 'asdf' as any;
//   },
// });

// const run = async () => {
//   const asdf = await sdk.user.testEndpoint('12');
// };

// const p = new Proxy(function () {}, {
//   get(obj, name: string) {
//     if (typeof name === 'string' && name !== 'constructor') {
//       return makeSubSDK([...path, name]);
//     }
//     return obj;
//   },
//   apply: function (_target, _thisArg, argumentsList) {
//     console.log('called: ' + argumentsList.join(', '));
//     return argumentsList[0] + argumentsList[1] + argumentsList[2];
//   },
// });
