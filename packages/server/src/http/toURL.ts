export function toURL(urlOrPathname: string): URL {
  if (URL.canParse(urlOrPathname)) {
    return new URL(urlOrPathname);
  }
  return new URL(urlOrPathname, 'http://127.0.0.1');
}
