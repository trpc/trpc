import React from 'react';
import { getHighlighter, setCDN } from 'shiki';

setCDN('https://unpkg.com/shiki/');
const highlighterPromise = getHighlighter({
  themes: ['nord', 'min-light'],
  langs: ['ts'],
});

export const ShikiCodeBlock: React.FC<{ code: string; lang: string }> = ({
  code,
  lang = 'ts',
}) => {
  const [lightHtml, setLightHtml] = React.useState('');
  const [darkHtml, setDarkHtml] = React.useState('');
  React.useEffect(() => {
    void highlighterPromise.then((highlighter) => {
      const dark = highlighter.codeToHtml(code, { lang, theme: 'nord' });
      setDarkHtml(dark);

      const light = highlighter.codeToHtml(code, { lang, theme: 'min-light' });
      setLightHtml(light);
    });
  }, [code, lang]);
  return (
    <>
      <div
        className="shiki-code-block hidden dark:block"
        dangerouslySetInnerHTML={{ __html: darkHtml }}
      />
      <div
        className="shiki-code-block block dark:hidden"
        dangerouslySetInnerHTML={{ __html: lightHtml }}
      />
    </>
  );
};
