// @ts-nocheck
import * as __fd_glob_44 from "../content/docs/server/adapters/fetch.mdx?collection=docs"
import * as __fd_glob_43 from "../content/docs/client/vanilla/setup.mdx?collection=docs"
import * as __fd_glob_42 from "../content/docs/client/tanstack-react-query/usage.mdx?collection=docs"
import * as __fd_glob_41 from "../content/docs/client/tanstack-react-query/setup.mdx?collection=docs"
import * as __fd_glob_40 from "../content/docs/client/tanstack-react-query/server-components.mdx?collection=docs"
import * as __fd_glob_39 from "../content/docs/client/tanstack-react-query/migrating.mdx?collection=docs"
import * as __fd_glob_38 from "../content/docs/client/react/useUtils.mdx?collection=docs"
import * as __fd_glob_37 from "../content/docs/client/react/setup.mdx?collection=docs"
import * as __fd_glob_36 from "../content/docs/client/react/server-components.mdx?collection=docs"
import * as __fd_glob_35 from "../content/docs/client/react/introduction.mdx?collection=docs"
import * as __fd_glob_34 from "../content/docs/client/nextjs/setup.mdx?collection=docs"
import * as __fd_glob_33 from "../content/docs/client/nextjs/introduction.mdx?collection=docs"
import * as __fd_glob_32 from "../content/docs/client/links/splitLink.mdx?collection=docs"
import * as __fd_glob_31 from "../content/docs/client/links/localLink.mdx?collection=docs"
import * as __fd_glob_30 from "../content/docs/migration/migrate-from-v10-to-v11.mdx?collection=docs"
import * as __fd_glob_29 from "../content/docs/further/faq.mdx?collection=docs"
import * as __fd_glob_28 from "../content/docs/community/sponsors.mdx?collection=docs"
import * as __fd_glob_27 from "../content/docs/community/love.mdx?collection=docs"
import * as __fd_glob_26 from "../content/docs/community/contributing.mdx?collection=docs"
import * as __fd_glob_25 from "../content/docs/community/awesome-trpc.mdx?collection=docs"
import * as __fd_glob_24 from "../content/docs/videos-and-community-resources.mdx?collection=docs"
import * as __fd_glob_23 from "../content/docs/quickstart.mdx?collection=docs"
import * as __fd_glob_22 from "../content/docs/introduction.mdx?collection=docs"
import * as __fd_glob_21 from "../content/docs/getting-started.mdx?collection=docs"
import * as __fd_glob_20 from "../content/docs/example-apps.mdx?collection=docs"
import * as __fd_glob_19 from "../content/docs/concepts.mdx?collection=docs"
import { default as __fd_glob_18 } from "../content/docs/server/adapters/meta.json?collection=docs"
import { default as __fd_glob_17 } from "../content/docs/client/vanilla/meta.json?collection=docs"
import { default as __fd_glob_16 } from "../content/docs/client/tanstack-react-query/meta.json?collection=docs"
import { default as __fd_glob_15 } from "../content/docs/client/react/meta.json?collection=docs"
import { default as __fd_glob_14 } from "../content/docs/client/nextjs/meta.json?collection=docs"
import { default as __fd_glob_13 } from "../content/docs/client/links/meta.json?collection=docs"
import { default as __fd_glob_12 } from "../content/docs/server/meta.json?collection=docs"
import { default as __fd_glob_11 } from "../content/docs/migration/meta.json?collection=docs"
import { default as __fd_glob_10 } from "../content/docs/further/meta.json?collection=docs"
import { default as __fd_glob_9 } from "../content/docs/community/meta.json?collection=docs"
import { default as __fd_glob_8 } from "../content/docs/client/meta.json?collection=docs"
import { default as __fd_glob_7 } from "../content/docs/meta.json?collection=docs"
import * as __fd_glob_6 from "../content/blog/typescript-performance-lessons.mdx?collection=blogPosts"
import * as __fd_glob_5 from "../content/blog/trpc-actions.mdx?collection=blogPosts"
import * as __fd_glob_4 from "../content/blog/tinyrpc-client.mdx?collection=blogPosts"
import * as __fd_glob_3 from "../content/blog/new-tanstack-react-query-integration.mdx?collection=blogPosts"
import * as __fd_glob_2 from "../content/blog/hello-world.mdx?collection=blogPosts"
import * as __fd_glob_1 from "../content/blog/announcing-trpc-11.mdx?collection=blogPosts"
import * as __fd_glob_0 from "../content/blog/announcing-trpc-10.mdx?collection=blogPosts"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const blogPosts = await create.doc("blogPosts", "content/blog", {"announcing-trpc-10.mdx": __fd_glob_0, "announcing-trpc-11.mdx": __fd_glob_1, "hello-world.mdx": __fd_glob_2, "new-tanstack-react-query-integration.mdx": __fd_glob_3, "tinyrpc-client.mdx": __fd_glob_4, "trpc-actions.mdx": __fd_glob_5, "typescript-performance-lessons.mdx": __fd_glob_6, });

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_7, "client/meta.json": __fd_glob_8, "community/meta.json": __fd_glob_9, "further/meta.json": __fd_glob_10, "migration/meta.json": __fd_glob_11, "server/meta.json": __fd_glob_12, "client/links/meta.json": __fd_glob_13, "client/nextjs/meta.json": __fd_glob_14, "client/react/meta.json": __fd_glob_15, "client/tanstack-react-query/meta.json": __fd_glob_16, "client/vanilla/meta.json": __fd_glob_17, "server/adapters/meta.json": __fd_glob_18, }, {"concepts.mdx": __fd_glob_19, "example-apps.mdx": __fd_glob_20, "getting-started.mdx": __fd_glob_21, "introduction.mdx": __fd_glob_22, "quickstart.mdx": __fd_glob_23, "videos-and-community-resources.mdx": __fd_glob_24, "community/awesome-trpc.mdx": __fd_glob_25, "community/contributing.mdx": __fd_glob_26, "community/love.mdx": __fd_glob_27, "community/sponsors.mdx": __fd_glob_28, "further/faq.mdx": __fd_glob_29, "migration/migrate-from-v10-to-v11.mdx": __fd_glob_30, "client/links/localLink.mdx": __fd_glob_31, "client/links/splitLink.mdx": __fd_glob_32, "client/nextjs/introduction.mdx": __fd_glob_33, "client/nextjs/setup.mdx": __fd_glob_34, "client/react/introduction.mdx": __fd_glob_35, "client/react/server-components.mdx": __fd_glob_36, "client/react/setup.mdx": __fd_glob_37, "client/react/useUtils.mdx": __fd_glob_38, "client/tanstack-react-query/migrating.mdx": __fd_glob_39, "client/tanstack-react-query/server-components.mdx": __fd_glob_40, "client/tanstack-react-query/setup.mdx": __fd_glob_41, "client/tanstack-react-query/usage.mdx": __fd_glob_42, "client/vanilla/setup.mdx": __fd_glob_43, "server/adapters/fetch.mdx": __fd_glob_44, });