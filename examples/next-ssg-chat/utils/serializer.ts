import { DataTransformer } from '@katt/trpc-server';
import superjson from 'superjson';

// https://github.com/blitz-js/superjson/pull/95
export const sj: DataTransformer = {
  deserialize: (data) => {
    const res = superjson.deserialize(data);
    console.log('deserializing', { data, res });
    return res;
  },
  serialize: (input) => {
    const res = superjson.serialize(input);
    if (!res.meta) {
      delete res.meta;
    }
    console.log('deserializing', { input, res });
    return res;
  },
};
