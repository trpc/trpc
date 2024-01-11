import CodeBlock from '@theme/CodeBlock';
import TabItem from '@theme/TabItem';
import Tabs from '@theme/Tabs';
import React from 'react';

export function InstallSnippet() {
  return (
    <Tabs>
      <TabItem value="npm" label="npm" default>
        <CodeBlock language="bash">
          npm install @trpc/server@next @trpc/client@next @trpc/react-query@next
          @trpc/next@next @tanstack/react-query zod
        </CodeBlock>
      </TabItem>

      <TabItem value="yarn" label="yarn">
        ```sh yarn add @trpc/server@next @trpc/client@next
        @trpc/react-query@next @trpc/next@next @tanstack/react-query zod ```
      </TabItem>

      <TabItem value="pnpm" label="pnpm">
        ```sh pnpm add @trpc/server@next @trpc/client@next
        @trpc/react-query@next @trpc/next@next @tanstack/react-query zod ```
      </TabItem>

      <TabItem value="bun" label="bun">
        ```sh bun add @trpc/server@next @trpc/client@next @trpc/react-query@next
        @trpc/next@next @tanstack/react-query zod ```
      </TabItem>
    </Tabs>
  );
}
