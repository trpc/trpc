<img src="https://static.scarf.sh/a.png?x-pxid=d988eb79-b0fc-4a2b-8514-6a1ab932d188" />

# TanStack Vue Router

<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="https://tanstack.com/api/readme/router.png?title=TanStack%20Vue%20Router&theme=dark"
  />
  <source
    media="(prefers-color-scheme: light)"
    srcset="https://tanstack.com/api/readme/router.png?title=TanStack%20Vue%20Router"
  />
  <img
    src="https://tanstack.com/api/readme/router.png?title=TanStack%20Vue%20Router"
    alt="TanStack Vue Router"
    width="900"
  />
</picture>

🤖 Type-safe router w/ built-in caching & URL state management for Vue!

<a href="https://twitter.com/intent/tweet?button_hashtag=TanStack" target="\_parent">
  <img alt="#TanStack" src="https://img.shields.io/twitter/url?color=%2308a0e9&label=%23TanStack&style=social&url=https%3A%2F%2Ftwitter.com%2Fintent%2Ftweet%3Fbutton_hashtag%3DTanStack">
</a><a href="https://discord.com/invite/WrRKjPJ" target="\_parent">
  <img alt="" src="https://img.shields.io/badge/Discord-TanStack-%235865F2" />
</a><a href="https://npmjs.com/package/@tanstack/vue-router" target="\_parent">
  <img alt="" src="https://img.shields.io/npm/dm/@tanstack/router.svg" />
</a><a href="https://bundlephobia.com/result?p=@tanstack/vue-router" target="\_parent">
  <img alt="" src="https://badgen.net/bundlephobia/minzip/@tanstack/vue-router" />
</a><a href="#badge">
    <img alt="semantic-release" src="https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg">
  </a><a href="https://github.com/TanStack/router/discussions">
  <img alt="Join the discussion on Github" src="https://img.shields.io/badge/Github%20Discussions%20%26%20Support-Chat%20now!-blue" />
</a><a href="https://bestofjs.org/projects/router"><img alt="Best of JS" src="https://img.shields.io/endpoint?url=https://bestofjs-serverless.now.sh/api/project-badge?fullName=tanstack%2Frouter%26since=daily" /></a><a href="https://github.com/TanStack/router" target="\_parent">
  <img alt="" src="https://img.shields.io/github/stars/tanstack/router.svg?style=social&label=Star" />
</a><a href="https://twitter.com/tan_stack" target="\_parent">
  <img alt="" src="https://img.shields.io/twitter/follow/tan_stack.svg?style=social&label=Follow @TanStack" />
</a><a href="https://twitter.com/tannerlinsley" target="\_parent">
  <img alt="" src="https://img.shields.io/twitter/follow/tannerlinsley.svg?style=social&label=Follow @TannerLinsley" />
</a>

## Visit [tanstack.com/router](https://tanstack.com/router) for docs, guides, API and more!

## File-Based Routing Conventions

| Suffix/Pattern                      | Purpose                                                  |
| ----------------------------------- | -------------------------------------------------------- |
| `.route.ts`                         | Route configuration (loader, validateSearch, head, etc.) |
| `.component.vue`                    | The component rendered for the route                     |
| `.errorComponent.vue`               | Error boundary component for the route                   |
| `.notFoundComponent.vue`            | Not found component for the route                        |
| `.lazy.ts`                          | Lazy-loaded route configuration                          |
| `_layout` prefix                    | Layout routes that wrap child routes                     |
| `_` suffix (e.g., `posts_.$postId`) | Unnested routes (break out of parent layout)             |
| `(groupName)` directory             | Route groups (organizational, don't affect URL)          |
| `$param`                            | Dynamic route parameters                                 |

### Examples from e2e/basic-file-routes/ project

```
src/routes/
├── __root.ts                   # Root route config
├── __root.component.vue        # Root layout component
├── __root.notFoundComponent.vue # Global not found component
├── index.route.ts              # "/" route config
├── index.component.vue         # "/" component
├── posts.route.ts              # "/posts" route config
├── posts.component.vue         # "/posts" layout component
├── posts.index.component.vue   # "/posts" index component
├── posts.$postId.route.ts      # "/posts/:postId" route config
├── posts.$postId.component.vue # "/posts/:postId" component
├── posts.$postId.errorComponent.vue  # Error boundary for post
├── posts_.$postId.edit.route.ts      # "/posts/:postId/edit" (unnested)
├── (group)/                    # Route group (no URL impact)
│   ├── _layout.route.ts        # Layout for group
│   ├── _layout.component.vue
│   └── inside.component.vue    # "/inside"
└── 대한민국.component.vue        # Unicode routes supported
```
