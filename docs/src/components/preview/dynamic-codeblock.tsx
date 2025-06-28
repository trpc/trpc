'use client';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';
import { useState } from 'react';
import { bundledLanguages } from 'shiki';

export default function Example() {
  const [lang, setLang] = useState('js');
  const [code, setCode] = useState('console.log("This is pre-rendered")');

  return (
    <div className="prose flex flex-col gap-4 rounded-lg bg-fd-background p-4">
      <div className="not-prose flex flex-col rounded-lg bg-fd-secondary text-fd-secondary-foreground">
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="w-fit bg-transparent px-4 py-2 text-sm focus-visible:outline-none"
        >
          {Object.keys(bundledLanguages).map((lang) => (
            <option value={lang} key={lang}>
              {lang}
            </option>
          ))}
        </select>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="bg-transparent px-4 py-2 text-sm focus-visible:outline-none"
        />
      </div>
      <DynamicCodeBlock
        lang={lang}
        code={code}
        options={{
          themes: {
            light: 'catppuccin-latte',
            dark: 'catppuccin-mocha',
          },
        }}
      />
    </div>
  );
}
