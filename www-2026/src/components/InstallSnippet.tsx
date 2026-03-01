'use client';

import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';

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
    <Tabs items={Object.keys(snippets)}>
      {Object.entries(snippets).map(([key, value]) => (
        <Tab key={key} value={key}>
          <DynamicCodeBlock lang="bash" code={value} />
        </Tab>
      ))}
    </Tabs>
  );
}
