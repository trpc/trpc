import * as trpcServer from '../../server/src';
jest.mock('@trpc/server', () => trpcServer);
import * as trpcClient from '../../client/src';
jest.mock('@trpc/client', () => trpcClient);
import * as trpcReact from '../../react/src';
jest.mock('@trpc/react', () => trpcReact);
import * as trpcReact__ssg from '../../react/src/ssg';
jest.mock('@trpc/react/ssg', () => trpcReact__ssg);

export { trpcServer, trpcClient, trpcReact, trpcReact__ssg };
