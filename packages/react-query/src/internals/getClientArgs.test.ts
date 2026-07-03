import { getClientArgs } from './getClientArgs';
import type { TRPCQueryKey } from './getQueryKey';

const queryKey: TRPCQueryKey = [
  ['posts'],
  { input: { limit: 10 }, type: 'infinite' },
];

describe('getClientArgs', () => {
  describe('infiniteParams.pageParam', () => {
    it('includes cursor when pageParam is a positive number', () => {
      const [, input] = getClientArgs(
        queryKey,
        {},
        { pageParam: 5, direction: 'forward' },
      );
      expect(input).toMatchObject({ cursor: 5 });
    });

    it('includes cursor when pageParam is 0 (offset-based pagination)', () => {
      const [, input] = getClientArgs(
        queryKey,
        {},
        { pageParam: 0, direction: 'forward' },
      );
      expect(input).toMatchObject({ cursor: 0 });
    });

    it('includes cursor when pageParam is an empty string', () => {
      const [, input] = getClientArgs(
        queryKey,
        {},
        { pageParam: '', direction: 'forward' },
      );
      expect(input).toMatchObject({ cursor: '' });
    });

    it('omits cursor when pageParam is null (no cursor / initial page)', () => {
      const [, input] = getClientArgs(
        queryKey,
        {},
        { pageParam: null, direction: 'forward' },
      );
      expect(input).not.toHaveProperty('cursor');
    });

    it('omits cursor when pageParam is undefined', () => {
      const [, input] = getClientArgs(
        queryKey,
        {},
        { pageParam: undefined, direction: 'forward' },
      );
      expect(input).not.toHaveProperty('cursor');
    });
  });
});
