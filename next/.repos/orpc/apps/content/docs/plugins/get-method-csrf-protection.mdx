---
title: "GET Method CSRF Protection Plugin"
description: "Use GetMethodCsrfProtectionHandlerPlugin to make the safe GET method as secure as POST by rejecting navigations that may carry SameSite=Lax cookies from another site."
sidebar:
  label: "GET Method CSRF Protection"
---

## How It Works

Cross-site, browsers withhold explicitly marked [`SameSite=Lax`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value) cookies from unsafe methods such as `POST`, but still attach them to [safe methods](https://developer.mozilla.org/en-US/docs/Glossary/Safe/HTTP) like `GET` on top-level navigations, per [RFC 6265bis](https://datatracker.ietf.org/doc/draft-ietf-httpbis-rfc6265bis/). The plugin closes that gap by rejecting exactly those navigations with a `403`:

| Request from another site | Sends `SameSite=Lax` cookies | |
| --- | --- | --- |
| link click, redirect, `window.open`, GET form | yes | rejected |
| address bar, bookmark, link from an email or native app | yes | rejected |
| `fetch`, `XMLHttpRequest` | no | allowed, CORS governs the response |
| `<img>`, `<script>`, media, prefetch | no | allowed |
| `<iframe>`, `<embed>`, `<object>`, which are not top-level | no | allowed |
| any method other than `GET` | no | ignored |

The verdict comes from [Fetch Metadata](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers#fetch_metadata_request_headers): a `GET` request is rejected when [`Sec-Fetch-Site`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Site) reports `cross-site` or `none` on a top-level navigation (`Sec-Fetch-Mode: navigate` targeting `Sec-Fetch-Dest: document`). A guarded request stripped of either header is rejected. Only `GET` needs guarding, since [navigations use no method](https://html.spec.whatwg.org/multipage/browsing-the-web.html) besides `GET` and the unsafe `POST`. The result resembles upgrading your cookies to `SameSite=Strict` for safe methods, and also covers links opened from outside the browser, where browsers attach even `Strict` cookies.

Cookie-less cross-site requests pass, which makes the plugin the natural safeguard for [enabling the `GET` method](/docs/rpc/handler#enabling-the-get-method). Requests from your own site always pass, including sibling subdomains, since the `SameSite` cookie model makes the site the trust boundary. Host untrusted content on a separate site, not a subdomain.

Only requests that match a procedure are judged. The rest stay unmatched, so a handler that falls through to a static site or SPA keeps serving visitors arriving from links on other sites.

## Setup

```ts twoslash
import { RPCHandler } from '@orpc/server/fetch'
import { router } from './shared/planet'
// ---cut---
import { GetMethodCsrfProtectionHandlerPlugin } from '@orpc/server/plugins'
import { RPC_DEFAULT_ALLOW_METHODS } from '@orpc/server/standard'

const handler = new RPCHandler(router, {
  allowMethods: ['GET', ...RPC_DEFAULT_ALLOW_METHODS],
  plugins: [
    new GetMethodCsrfProtectionHandlerPlugin(),
  ],
})
```

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or a custom one.
:::

## Cookie Requirements

Mark authentication cookies `SameSite=Lax` or `SameSite=Strict` explicitly. Do not rely on browser defaults: only Chrome treats unmarked cookies as `Lax`, while Firefox and Safari treat them like `SameSite=None`, and Chrome still sends fresh unmarked cookies on cross-site `POST` for [two minutes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#lax).

With `SameSite=None` or unmarked cookies, cross-site requests the plugin allows, such as `fetch` and `<img>`, can still carry them. In that case, fix the cookie attribute or add a [synchronizer token](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#synchronizer-token-pattern).

## Limitations

- Fetch Metadata is [Baseline widely available](https://developer.mozilla.org/en-US/docs/Glossary/Baseline/Compatibility), supported by every major browser since Safari 16.4 in March 2023. Older browsers and header-stripping proxies pass through unchecked.
- Browsers [send Fetch Metadata only to trustworthy URLs](https://w3c.github.io/webappsec-fetch-metadata/): HTTPS and `localhost`. Over plain HTTP the headers are absent while cookies are not, so every request passes, and `localhost` qualifying hides this in development.
- Users cannot open guarded procedures by typing the URL, following a bookmark, or clicking a link, since those navigations look identical to a forged one. Test with `curl` or a same-origin page instead.
- Prefer `SameSite=Strict` or a [synchronizer token](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#synchronizer-token-pattern) for high-value requests.

## Learn More

Learn more about the attack this plugin prevents on [MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/CSRF) and in the [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). For implementation details, see the [source code](https://github.com/middleapi/orpc/blob/main/packages/server/src/plugins/get-method-csrf-protection.ts).
