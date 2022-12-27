/* eslint-disable */
import * as mock_trpcClient from '../../client/src';
import * as mock_trpcNext from '../../next/src';
import * as mock_trpcReact from '../../react-query/src';
import * as mock_trpcReact__shared from '../../react-query/src/shared';
import * as mock_trpcReact__ssg from '../../react-query/src/ssg';
import * as mock_trpcServer from '../../server/src';
import * as mock_trpcServer__observable from '../../server/src/observable';
import * as mock_trpcServer__shared from '../../server/src/shared';

jest.mock('@trpc/server', () => mock_trpcServer);

jest.mock('@trpc/server/observable', () => mock_trpcServer__observable);

jest.mock('@trpc/server/shared', () => mock_trpcServer__shared);

jest.mock('@trpc/client', () => mock_trpcClient);

jest.mock('@trpc/react-query', () => mock_trpcReact);

jest.mock('@trpc/react-query/ssg', () => mock_trpcReact__ssg);

jest.mock('@trpc/react-query/shared', () => mock_trpcReact__shared);

jest.mock('@trpc/next', () => mock_trpcNext);

export {
  mock_trpcServer as trpcServer,
  mock_trpcClient as trpcClient,
  mock_trpcReact as trpcReact,
  mock_trpcReact__ssg as trpcReact__ssg,
};
