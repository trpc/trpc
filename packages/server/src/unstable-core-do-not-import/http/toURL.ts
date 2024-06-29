export function toURL(urlOrPathname: string | URL): URL {
  if (urlOrPathname instanceof URL) {
    return urlOrPathname;
  }
  const url = urlOrPathname.startsWith('/')
    ? `http://127.0.0.1${urlOrPathname}`
    : urlOrPathname;

  return new URL(url);
}
