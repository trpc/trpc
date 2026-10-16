// kind, final href, blocked, active
export const linkHrefCases: Array<
  readonly [
    kind: 'history' | 'rewrite' | 'to',
    href: string,
    blocked: boolean,
    active: boolean,
  ]
> = [
  ['history', '//evil.example/path', true, false],
  ['history', '/\\evil.example/path', true, false],
  ['history', '\\/evil.example/path', true, false],
  ['history', '\x01 \t//evil.example/path', true, false],
  ['history', 'javascript:blocked()', true, false],
  ['history', '/formatted', false, true],
  ['rewrite', 'javascript:blocked()', true, false],
  ['rewrite', 'https://other.example/', false, false],
  ['rewrite', '/safe', false, true],
  ['to', 'myapp:open', false, false],
  ['to', 'mailto:person@example.com', true, false],
]
