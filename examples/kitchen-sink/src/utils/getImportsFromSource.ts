const IMPORTS_REGEX =
  /import\s+?(?:(?:(?:[\w*\s{},]*)\s+from\s+?)|)(?:(?:"(.*?)")|(?:'(.*?)'))[\s]*?(?:;|$|)/;
export function getImportsFromSource(source: string) {
  const modules: string[] = [];
  const lines = source.split(/\n|;/);

  for (const line of lines) {
    const matches = line.match(IMPORTS_REGEX);
    const moduleName = matches && (matches[1] || matches[2]);
    if (moduleName) {
      modules.push(moduleName);
    }
  }

  return modules;
}
