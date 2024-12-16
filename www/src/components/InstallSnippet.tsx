import CodeBlock from '@theme/CodeBlock';
import TabItem from '@theme/TabItem';
import Tabs from '@theme/Tabs';
import React from 'react';

export function InstallSnippet(props: { pkgs: string[] | string }) {
  const pkgs = Array.isArray(props.pkgs) ? props.pkgs.join(' ') : props.pkgs;
  const pkgsDeno = Array.isArray(props.pkgs)
    ? `npm:${props.pkgs.join(' npm:')}`
    : `npm:${props.pkgs.split(' ').join(' npm:')}`;

  const snippets: Record<string, string> = {
    npm: `npm install ${pkgs}`,
    yarn: `yarn add ${pkgs}`,
    pnpm: `pnpm add ${pkgs}`,
    bun: `bun add ${pkgs}`,
    deno: `deno add ${pkgsDeno}`,
  };
  return (
    <Tabs>
      {Object.entries(snippets).map(([key, value]) => (
        <TabItem key={key} value={key} label={key}>
          <CodeBlock
            language="bash"
            title="shell"
            className="InstallationSnippet__CodeBlock"
          >
            {value}
          </CodeBlock>
        </TabItem>
      ))}
    </Tabs>
  );
}
