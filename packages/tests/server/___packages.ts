import * as mock_trpcServer from '../../server/src';
vi.mock('@trpc/server', () => mock_trpcServer);
import * as mock_trpcServer__observable from '../../server/src/observable';
vi.mock('@trpc/server/observable', () => mock_trpcServer__observable);
import * as mock_trpcServer__shared from '../../server/src/shared';
vi.mock('@trpc/server/shared', () => mock_trpcServer__shared);

import * as mock_trpcClient from '../../client/src';
vi.mock('@trpc/client', () => mock_trpcClient);

import * as mock_trpcReact from '../../react-query/src';
vi.mock('@trpc/react-query', () => mock_trpcReact);
import * as mock_trpcReact__server from '../../react-query/src/server';
vi.mock('@trpc/react-query/server', () => mock_trpcReact__server);
import * as mock_trpcReact__ssg from '../../react-query/src/ssg';
vi.mock('@trpc/react-query/ssg', () => mock_trpcReact__ssg);
import * as mock_trpcReact__shared from '../../react-query/src/shared';
vi.mock('@trpc/react-query/shared', () => mock_trpcReact__shared);

import * as mock_trpcNext from '../../next/src';
vi.mock('@trpc/next', () => mock_trpcNext);

export { 
  mock_trpcServer as trpcServer,
  mock_trpcClient as trpcClient,
  mock_trpcReact as trpcReact,
  mock_trpcReact__ssg as trpcReact__ssg,
  mock_trpcReact__server as trpcReact__server 
};