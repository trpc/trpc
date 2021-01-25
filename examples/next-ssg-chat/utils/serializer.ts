import { DataTransformer } from '@trpc/server';
import superjson from 'superjson';

export const sj: DataTransformer = {
  deserialize: (data) => {
    const res = superjson.deserialize(data);
    // console.log('deserializing', { data, res });
    return res;
  },
  serialize: (input) => {
    const res = superjson.serialize(input);
    if (!res.meta) {
      // https://github.com/blitz-js/superjson/pull/95
      delete res.meta;
    }
    // console.log('deserializing', { input, res });
    return res;
  },
};
