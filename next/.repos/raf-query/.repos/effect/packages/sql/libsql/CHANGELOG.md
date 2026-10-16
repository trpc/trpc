# @effect/sql-libsql

## 4.0.1

### Patch Changes

- Updated dependencies [[`ed2cc2f`](https://github.com/Effect-TS/effect/commit/ed2cc2f322dfd24da550c8d0ac811c3130b79d74), [`58a2ee8`](https://github.com/Effect-TS/effect/commit/58a2ee8e0db8e0a90bae83c6cceeff6916772fee), [`bc44526`](https://github.com/Effect-TS/effect/commit/bc445262eeaaba6f7f28a154023a590e193e547d), [`073bb47`](https://github.com/Effect-TS/effect/commit/073bb475d1e84e09cdcd8303a4a558f2a73d8396), [`2ec021e`](https://github.com/Effect-TS/effect/commit/2ec021eff7fbd2206adc3e8bf4e803ed4bf07d6a), [`cad1118`](https://github.com/Effect-TS/effect/commit/cad111867a666cebe8ff9bf2237a997fa6e4cb14), [`1672d9c`](https://github.com/Effect-TS/effect/commit/1672d9ca8da3e5b536bf7afb73365cccc6c01f53), [`a81e4e6`](https://github.com/Effect-TS/effect/commit/a81e4e6cb3dfbf01b1c53c1c877fddeaced8a278), [`f5c2a91`](https://github.com/Effect-TS/effect/commit/f5c2a91621401a018b770446d35ef99806c5561f), [`498e72b`](https://github.com/Effect-TS/effect/commit/498e72ba14d0191d6bf66cc0e931c229a1ff442f), [`cabf123`](https://github.com/Effect-TS/effect/commit/cabf1230723e92684a4b0b836ccfde25c657f9f1), [`a5b1d4e`](https://github.com/Effect-TS/effect/commit/a5b1d4e4cae01dbe30890d3796f846bda00ad2ae), [`878cb33`](https://github.com/Effect-TS/effect/commit/878cb33f4f5f5a31d2c80a9ddb7d62a611230e1c), [`5e6f756`](https://github.com/Effect-TS/effect/commit/5e6f7568a4c895eab3087249b191c5dcba5e73ef), [`18dfb98`](https://github.com/Effect-TS/effect/commit/18dfb98cf6d2aeedbab8ef5734f9bc273a82d56e), [`04706ef`](https://github.com/Effect-TS/effect/commit/04706eff5da94b4d475b99eab8b0256bed97b080), [`f157482`](https://github.com/Effect-TS/effect/commit/f15748273a89afff4b05d5e6bec22c567c2a3cda), [`b5a2d4c`](https://github.com/Effect-TS/effect/commit/b5a2d4c1d62c9620a68d72b7f20248c69ef7663b), [`1c18c68`](https://github.com/Effect-TS/effect/commit/1c18c688df10b697c10283160dba143e049f3d50), [`43416c4`](https://github.com/Effect-TS/effect/commit/43416c4142f973f4988440716eb54a498659cd3a), [`d6ac8f9`](https://github.com/Effect-TS/effect/commit/d6ac8f923a33ff298a87f31230735e71d2d082e9), [`1d9fb8c`](https://github.com/Effect-TS/effect/commit/1d9fb8c540a11326650baa0866a17951665189e7), [`20dcd50`](https://github.com/Effect-TS/effect/commit/20dcd5060581077b46325a433f787ba10a56963d), [`42e5750`](https://github.com/Effect-TS/effect/commit/42e5750f7e2fbf349cfe45452d7cc9dce98d6fe9), [`888e326`](https://github.com/Effect-TS/effect/commit/888e326a3180aea9b117fe7c97aace5dd527596e), [`0b52bb4`](https://github.com/Effect-TS/effect/commit/0b52bb42fac5aecb8bcb8d899293c641b62c3f66), [`e823e69`](https://github.com/Effect-TS/effect/commit/e823e693773aa163c0081af00a5236118446c6ae), [`962647b`](https://github.com/Effect-TS/effect/commit/962647b6a16000f882e6999f001c513a8cccc711), [`43fdcdc`](https://github.com/Effect-TS/effect/commit/43fdcdc6c81b6ad22d54061d6c6c45d9243d7c33), [`1f89b8e`](https://github.com/Effect-TS/effect/commit/1f89b8ec64e6362da3eaaff8cbb235df88d3441c), [`e1a521a`](https://github.com/Effect-TS/effect/commit/e1a521a6886a281abee016ff9aa57c3b172057c8)]:
  - effect@4.0.1

## 4.0.0

### Patch Changes

- [#8633](https://github.com/Effect-TS/effect/pull/8633) [`2c552f2`](https://github.com/Effect-TS/effect/commit/2c552f220e09dd63d4a777db6cd20b9a13e732f4) Thanks @IMax153! - Effect 4.0 is the first stable release of Effect v4. It replaces the 4.0.0 beta and release-candidate series, whose per-release notes remain below under the `4.0.0-beta.*` and `4.0.0-rc.*` headings. To upgrade from Effect 3, follow the [migration guide](https://github.com/Effect-TS/effect/blob/main/MIGRATION.md).
  
  **Packaging and versioning**
  
  - All Effect packages share one version number and are released together. Use the same version of `effect` and every `@effect/*` package.
  - `@effect/platform`, `@effect/rpc`, `@effect/cluster`, `@effect/cli`, `@effect/ai`, `@effect/sql`, `@effect/workflow`, `@effect/experimental` and similar packages are merged into `effect`. Separate packages remain only for platforms (`@effect/platform-*`), SQL drivers (`@effect/sql-*`), AI providers (`@effect/ai-*`), framework bindings (`@effect/atom-*`), OpenTelemetry, Vitest and tooling.
  - Modules such as `effect/http`, `effect/http-api`, `effect/rpc`, `effect/cluster`, `effect/workflow`, `effect/ai`, `effect/cli`, `effect/sql` and `effect/schema` import from `effect/<area>`. APIs tagged `@stability unstable` may have breaking changes in minor releases. APIs without a stability tag follow semver.
  - APIs that expose a third-party dependency are tagged `@stability unstable`, because that dependency's releases can change them. This covers `NodeRedis`, `DenoRedis`, `BunRedis`, `@effect/platform-node/Undici` and the undici dispatcher APIs, the `ws` options and re-exports in the platform packages, driver-specific options and clients in `@effect/sql-clickhouse`, `@effect/sql-d1`, `@effect/sql-libsql`, `@effect/sql-mssql`, `@effect/sql-mysql2`, `@effect/sql-pglite` and `@effect/sql-sqlite-do`, the provider clients, models and generated schemas in the `@effect/ai-*` packages, `@effect/opentelemetry`, and the `vitest` re-export in `@effect/vitest`.
  - `effect` has no runtime dependencies.
  - New packages in v4: `@effect/platform-deno`, `@effect/sql-pglite`, `@effect/ai-openai-compat`, `@effect/ai-typesafe`, `@effect/atom-react`, `@effect/atom-solid`, `@effect/atom-vue`, `@effect/openapi-generator` and `@effect/doctest`. `@effect/docgen` now lives in this repository.
  
  **Core**
  
  - The fiber runtime was rewritten for lower memory use and faster execution, with smaller bundles and better tree-shaking.
  - Services are defined with `Context.Service`, `FiberRef` is replaced by `Context.Reference`, `Cause` has a flat structure, and many combinators were renamed. See the migration guide for the full list.
  - Software transactional memory is built into `Effect.tx`, with `TxRef`, `TxQueue`, `TxHashMap`, `TxPubSub`, `TxSemaphore` and related `Tx*` data types.
  - `Clock` separates wall-clock time from monotonic time.
  - New modules include `Semaphore`, `Latch`, `LayerRef`, `ErrorReporter`, `ByteSize`, `Newtype` and `Crypto`. `Arbitrary` is now a native property-based testing module and no longer depends on fast-check.
  
  **Schema**
  
  - Schema v4 is a new implementation with faster parsing, class-based schemas, `make` constructors on every schema, and effectful decoding with services.
  - `SchemaRepresentation` powers JSON Schema (Draft-04, Draft-07, 2020-12 and OpenAPI 3.0/3.1) import and export, TypeScript code generation, and AI structured output.
  - `SchemaBinary` provides a compact binary codec and is the default wire format for cluster transports.
  - Optional JIT and AOT schema compilers are available as experimental modules.
  
  **Platform, HTTP and RPC**
  
  - `HttpApi` supports typed response headers, streaming and SSE responses, the HTTP `QUERY` method, `HttpApiTest` for in-memory testing, and much faster type checking for large APIs.
  - The HTTP modules add static file serving, response compression, rate-limited clients and graceful server shutdown.
  - `Socket` has a pull-based reader with backpressure and STARTTLS support. Network addresses are modeled by `effect/net`.
  - RPC serialization is schema-aware and supports server-originated requests and notifications.
  - `@effect/platform-deno` adds full Deno support. The Node, Bun, Deno and browser packages all provide the platform `Crypto` service, and the browser package adds IndexedDB support.
  
  **Cluster and Workflow**
  
  - Workflows can be declared with class syntax, and `DurableQueue` and an in-memory `WorkflowEngine` are available.
  - Runner memory can be bounded with `ShardingConfig` limits. Shutdown, entity movement and persisted replies are more reliable.
  
  **SQL**
  
  - `@effect/sql-pg` uses a built-in PostgreSQL client with pipelining, prepared statements and binary codecs, and no longer depends on `pg`.
  - `@effect/sql-sqlite-node` uses Node's built-in `node:sqlite` and requires Node 22.16 or newer.
  - `SqlError` exposes structured reasons such as `UniqueViolation`.
  
  **AI**
  
  - `effect/ai` adds `EmbeddingModel`, the `DecisionModel` classification and rating API, dynamic tools and tool approvals.
  - The MCP server supports protocol versions 2024-11-05 through 2026-07-28, including elicitation, sampling with tools, resource subscriptions and typed tool output.
  - Provider packages cover Anthropic, OpenAI, OpenAI-compatible APIs and OpenRouter.
  
  **CLI, Atom, observability and testing**
  
  - `effect/cli` adds global flags, command aliases and examples, an interactive wizard mode, and shell completions for Bash, Zsh and Fish.
  - `effect/reactivity` and the `@effect/atom-*` bindings add SSR hydration, stale-while-revalidate atoms and serializable RPC and HttpApi queries.
  - The OTLP exporters can be configured with standard OpenTelemetry environment variables, and `@effect/opentelemetry` aligns logs and spans with the OpenTelemetry specification.
  - `@effect/vitest` runs property tests with the native `Arbitrary` module and supports Vitest fixtures.
  
  **Requirements**
  
  - TypeScript 5.9 or newer. TypeScript 7 is recommended.
  - `@effect/vitest` and `@effect/doctest` require Vitest 5.
  - `@effect/atom-react` requires React 19.
  - `@effect/platform-deno` requires Deno 2.8.3 or newer.
- Updated dependencies [[`cbfc7b4`](https://github.com/Effect-TS/effect/commit/cbfc7b422046111c439a69ecbce7fc4f4899789d), [`5a81a6f`](https://github.com/Effect-TS/effect/commit/5a81a6f47521123a4075c6c221fb888d109778af), [`68b6394`](https://github.com/Effect-TS/effect/commit/68b639473ff211b654b49b7b82183cafd225f4a3), [`5250ca6`](https://github.com/Effect-TS/effect/commit/5250ca63c6f15152b4cdd36ef78b32ab06a0075e), [`5f9c9d1`](https://github.com/Effect-TS/effect/commit/5f9c9d17c1a2d18e3217b251d28de0015bba02fd), [`3278821`](https://github.com/Effect-TS/effect/commit/3278821a6490f7f76b30217115e921e1d3dc7f34), [`83429b4`](https://github.com/Effect-TS/effect/commit/83429b42023e79c29137381dc210a57bc0137ade), [`0af6d0c`](https://github.com/Effect-TS/effect/commit/0af6d0c8ceaf08656f76bba41e5965bbf9a76bac), [`927e01e`](https://github.com/Effect-TS/effect/commit/927e01e00579c14d446e15e077775e973d75f9a1), [`10d8524`](https://github.com/Effect-TS/effect/commit/10d8524dc40fd06075f6a70f88d3a0cbd3477178), [`35ac25a`](https://github.com/Effect-TS/effect/commit/35ac25a80bec4977a082af57a618d6a02bb41e25), [`29e0aa7`](https://github.com/Effect-TS/effect/commit/29e0aa7dcc7735e207a687ba0f6a7ddebfe0996e), [`8783536`](https://github.com/Effect-TS/effect/commit/878353689f69b555ad64f9dc14d4c66fd547360d), [`df77fff`](https://github.com/Effect-TS/effect/commit/df77fff9396fe31de72d1947ecb5b74f8cee89e1), [`ef7d77f`](https://github.com/Effect-TS/effect/commit/ef7d77f382dcb2a4f7648211ed6d674984a47c36), [`035e369`](https://github.com/Effect-TS/effect/commit/035e369b3a30bcd840a7a78ccfb94d251bf931b7), [`f72790c`](https://github.com/Effect-TS/effect/commit/f72790c618260bdfbf7a4e14d10abc2341d21e56), [`aa19472`](https://github.com/Effect-TS/effect/commit/aa1947284cee5cec68d08df9c5b41fae8fe1aa8c), [`988c467`](https://github.com/Effect-TS/effect/commit/988c467afa90449b1d441c2db645eaec236763ac), [`735b77b`](https://github.com/Effect-TS/effect/commit/735b77b65ca909ca6e41915f0d1366531c32142a), [`e5f7d12`](https://github.com/Effect-TS/effect/commit/e5f7d12af9abef188f7dc39b0207af1801b03ffd), [`2c552f2`](https://github.com/Effect-TS/effect/commit/2c552f220e09dd63d4a777db6cd20b9a13e732f4)]:
  - effect@4.0.0

## 4.0.0-rc.118

### Patch Changes

- [#8419](https://github.com/Effect-TS/effect/pull/8419) [`926e8bf`](https://github.com/Effect-TS/effect/commit/926e8bf4c19545910da5e596ec7cfa3bb63abae9) Thanks @danieljvdm! - Expose each libSQL client's active transaction through its `transactionService` tag.
- Updated dependencies [[`f75468a`](https://github.com/Effect-TS/effect/commit/f75468a1358bdea7203344eecc818cc3370d45a1), [`34cc788`](https://github.com/Effect-TS/effect/commit/34cc78833df55bcc35b1f92603897aad36976b49), [`eb02cbb`](https://github.com/Effect-TS/effect/commit/eb02cbb3f4d1f4bf20e597fe8fc707892aa930e0), [`4bb949e`](https://github.com/Effect-TS/effect/commit/4bb949e64f513b136f47e7e8ca6790fa0fe9aca9), [`b409e3f`](https://github.com/Effect-TS/effect/commit/b409e3f8f48a108620c2c9ba52512942dfcf7563), [`4093507`](https://github.com/Effect-TS/effect/commit/4093507c667c8888d44920a0d742573b39c66723), [`325e0fb`](https://github.com/Effect-TS/effect/commit/325e0fb66a69705decafacb781e6f9fb45f4f462), [`e54211a`](https://github.com/Effect-TS/effect/commit/e54211a57d067d941d499e24deb0cae8fb381ca1), [`0c6c2de`](https://github.com/Effect-TS/effect/commit/0c6c2dec861becef8ff6c240a60bf0a61254040a), [`cdeccc7`](https://github.com/Effect-TS/effect/commit/cdeccc7e526ac386cfeb04107881642bcc9b320d), [`254fcc1`](https://github.com/Effect-TS/effect/commit/254fcc1944574118ac32c57ca0298a715b558889), [`bd14b64`](https://github.com/Effect-TS/effect/commit/bd14b6431a1eaf3619508beaaffd87e542c7ab03), [`37064fd`](https://github.com/Effect-TS/effect/commit/37064fdfc8fb7b6a765045e66b95f6106aef1955), [`702c34e`](https://github.com/Effect-TS/effect/commit/702c34e2af388d411d666fe3eb102fe9c7c11c78), [`7ef0ce6`](https://github.com/Effect-TS/effect/commit/7ef0ce6f4295ea6fab131ec8f4af9efd67d9cf1a), [`325e0fb`](https://github.com/Effect-TS/effect/commit/325e0fb66a69705decafacb781e6f9fb45f4f462), [`cdec5ef`](https://github.com/Effect-TS/effect/commit/cdec5efd02f6487f71bc1bdfc0ed8cf0ff2b49a1), [`f9179cb`](https://github.com/Effect-TS/effect/commit/f9179cba72cf2549574553e1e126669c71be52c0), [`c760e1e`](https://github.com/Effect-TS/effect/commit/c760e1e07497a658d971326152198b571fa5780e), [`1b4461e`](https://github.com/Effect-TS/effect/commit/1b4461ec3a17e527dd39576f1783f73354187f1f), [`5709ef6`](https://github.com/Effect-TS/effect/commit/5709ef6c0375a4b0e028bfa288d6eb3f13d70d7b), [`6b84149`](https://github.com/Effect-TS/effect/commit/6b84149622de85ba147e578da37ae4d996c1a683), [`508c70b`](https://github.com/Effect-TS/effect/commit/508c70be1379bbcf854d318604a992e0662122d6), [`382992f`](https://github.com/Effect-TS/effect/commit/382992f168d8187686010d6aa781f0d1fd48093a), [`83d7c95`](https://github.com/Effect-TS/effect/commit/83d7c954651fe6291c009f1d4198e796cad3b069), [`6bf2eb7`](https://github.com/Effect-TS/effect/commit/6bf2eb76f0800d2e8ca402322023db6a32b1a899), [`ccade14`](https://github.com/Effect-TS/effect/commit/ccade1492cdc6beb71f943d7605c2ef5208b155c), [`b8d14d3`](https://github.com/Effect-TS/effect/commit/b8d14d3eed3cc15e939baa660e9800b96144a636), [`8fca194`](https://github.com/Effect-TS/effect/commit/8fca1947498e50dfa10480221290115a99cee05b), [`34e09be`](https://github.com/Effect-TS/effect/commit/34e09becb6b93b885bbdbc1da4780b7f848bd2d0), [`97afa37`](https://github.com/Effect-TS/effect/commit/97afa37ed03caba82fe3aec8e376ca8388450742), [`321bae6`](https://github.com/Effect-TS/effect/commit/321bae616dfafc17f89a5406919f52f8d133c4d1), [`fb718d3`](https://github.com/Effect-TS/effect/commit/fb718d3192acdcc6123daff69d150d040d911bf2), [`ccd3440`](https://github.com/Effect-TS/effect/commit/ccd344096340fd1cdb28a315a6eb3eaced82ccbc), [`107dbec`](https://github.com/Effect-TS/effect/commit/107dbecab1debe45baae97e50913c0b5d6d84bb5), [`af510e8`](https://github.com/Effect-TS/effect/commit/af510e8197a486d53a0164a49ca4bf9276f6a19a), [`537cd82`](https://github.com/Effect-TS/effect/commit/537cd821740036410494e7f420bbae5b84b7c0af), [`ff554ae`](https://github.com/Effect-TS/effect/commit/ff554aeb9b000882accc1c7027507e753aabf277), [`9a5a383`](https://github.com/Effect-TS/effect/commit/9a5a383cc6526843fef645309f822400e053e772), [`d2f3547`](https://github.com/Effect-TS/effect/commit/d2f35475610c59596eec2cd47fb58c65b85ef0c1), [`25d9e47`](https://github.com/Effect-TS/effect/commit/25d9e47f0132e485af466a75e6008600b12da999), [`372a45d`](https://github.com/Effect-TS/effect/commit/372a45de59170e2ac982aaac0b5d173d3f84b0f8), [`5e9fd25`](https://github.com/Effect-TS/effect/commit/5e9fd25cbda46b0e035644fb94aa4a9c8851263d), [`c85c8c3`](https://github.com/Effect-TS/effect/commit/c85c8c31783afab69ac2aff791549bd438ec6015), [`b501557`](https://github.com/Effect-TS/effect/commit/b501557939d74c5fa6228c40011e9546c2af0fb2), [`35ef06c`](https://github.com/Effect-TS/effect/commit/35ef06c56dcf2debedbf72043d660980eeb73e83), [`d6cc5d9`](https://github.com/Effect-TS/effect/commit/d6cc5d987011c10e42985dc692130511949838d1), [`83b7b1f`](https://github.com/Effect-TS/effect/commit/83b7b1fc9124d23519cc5b8b74a42129c2ce59d9), [`f05fe36`](https://github.com/Effect-TS/effect/commit/f05fe36f877b751d8602aa3fc5cb0c9501619167), [`1fd49d4`](https://github.com/Effect-TS/effect/commit/1fd49d4e379effa86cbfa81650afa39ca28293f5), [`c79088d`](https://github.com/Effect-TS/effect/commit/c79088d69372ba533ecd6cacb846a43322c2d075), [`0cbb457`](https://github.com/Effect-TS/effect/commit/0cbb45792b59e9ea00e19001a019e790d53407e6), [`8202a6e`](https://github.com/Effect-TS/effect/commit/8202a6ea410aa9a5a92988ad54f83b831a9737fe), [`8d070c3`](https://github.com/Effect-TS/effect/commit/8d070c3eadc89bda58fec23977ba8ceebc244347), [`0cf7655`](https://github.com/Effect-TS/effect/commit/0cf7655d1fe0ca959f34d261e345cc222fd8e5fd), [`d470d54`](https://github.com/Effect-TS/effect/commit/d470d54495b9b7ac66375abd95e294417ebc64b9), [`2121472`](https://github.com/Effect-TS/effect/commit/21214728d20b17b4b0497dac85bc9be5c8ed0bd3), [`4113bc7`](https://github.com/Effect-TS/effect/commit/4113bc78eeed050b5833c9460d398cf8d8887e48), [`a41a441`](https://github.com/Effect-TS/effect/commit/a41a4414d30a7f96aa8f17ec25039dd194718ef5), [`3af6bd0`](https://github.com/Effect-TS/effect/commit/3af6bd0803ebdbc44b75ef82b16daa9a82ffa768), [`67ee3b8`](https://github.com/Effect-TS/effect/commit/67ee3b87f025089cc01631985ad7860b391d6ef3), [`e8df3d8`](https://github.com/Effect-TS/effect/commit/e8df3d8e7650ce272256559081ad91156826bf54), [`1dbc4c3`](https://github.com/Effect-TS/effect/commit/1dbc4c382c783099c74c93dae20d72a12db92e69), [`80d5adb`](https://github.com/Effect-TS/effect/commit/80d5adb16787b11507a67809fbe6978da719d76a), [`aa430d8`](https://github.com/Effect-TS/effect/commit/aa430d89c134520d9e77babbf759a73650244c89), [`24f7d32`](https://github.com/Effect-TS/effect/commit/24f7d32b389026f0395b9ec30d49f9091eb2b114), [`f4dd1ae`](https://github.com/Effect-TS/effect/commit/f4dd1aec1ab5aaad01d831958c8ee709a9f4661b), [`0981d01`](https://github.com/Effect-TS/effect/commit/0981d01df8e20390ca407e3b64d9e6b56f59d4b5), [`0a29ca6`](https://github.com/Effect-TS/effect/commit/0a29ca6840a362cbc9d32fb263cddef804cbc6fd), [`17810b4`](https://github.com/Effect-TS/effect/commit/17810b478d3d01445ab8da9062df48f7f841b508), [`62b2ea9`](https://github.com/Effect-TS/effect/commit/62b2ea97fe8fd85f44b508cf2633fee5d1e285e9), [`4e4fa8b`](https://github.com/Effect-TS/effect/commit/4e4fa8b18455dc05c5a601ae7613b95c27aadabd), [`3495bd8`](https://github.com/Effect-TS/effect/commit/3495bd8858de3a7b7e75090587f813e096e851ee), [`b3032f0`](https://github.com/Effect-TS/effect/commit/b3032f01f288942e7ef7398efc654b58d6525792), [`d26a913`](https://github.com/Effect-TS/effect/commit/d26a913221566bd6156be860dfb9cd5c55796d1c), [`93f826a`](https://github.com/Effect-TS/effect/commit/93f826af79734296b9659400cb5f3c29f45dba32), [`330b747`](https://github.com/Effect-TS/effect/commit/330b7475e2135bb9bc6aad1df5d513d32299ebc1), [`b808b5d`](https://github.com/Effect-TS/effect/commit/b808b5d0c0132e7456f81125ff989b83106c1468), [`2575fcc`](https://github.com/Effect-TS/effect/commit/2575fcc12bb4d1aed5603cfab579d9030e78e231), [`287273c`](https://github.com/Effect-TS/effect/commit/287273cf55971f87dd62cb229d934dcf52242d74), [`0860c0c`](https://github.com/Effect-TS/effect/commit/0860c0c125322a99454b30aafa2963f7289d70d6), [`8d27554`](https://github.com/Effect-TS/effect/commit/8d275546500c91a752da26ad37756e887fb4595c), [`c2e810c`](https://github.com/Effect-TS/effect/commit/c2e810cc7ae3f49f3e888ce83700ebdf1c34c503), [`35ecbb9`](https://github.com/Effect-TS/effect/commit/35ecbb986497d6593ff88faa44b8b1eb8e252024), [`b442528`](https://github.com/Effect-TS/effect/commit/b442528ddf9608cf9b559b94b77198cc51643dd7), [`16623c7`](https://github.com/Effect-TS/effect/commit/16623c7d30c8ff654e33fce1122aae7f5e5d8d78), [`5521209`](https://github.com/Effect-TS/effect/commit/5521209a7697498dc26fe658a52d137c6c82c47e), [`477394d`](https://github.com/Effect-TS/effect/commit/477394deb644711551d4830e591b538d7267d0db), [`3036241`](https://github.com/Effect-TS/effect/commit/3036241e1e4366dd92047f4126f62e3f241abefd), [`ca422fd`](https://github.com/Effect-TS/effect/commit/ca422fdf49416343328ac1d978bc1769877a5ebe), [`4f5f866`](https://github.com/Effect-TS/effect/commit/4f5f86689657e935e881652fd107fa184dc6a542), [`54ff4f2`](https://github.com/Effect-TS/effect/commit/54ff4f2121d371f7c8c3b47df821c6e5ac8c923f), [`c8a9f85`](https://github.com/Effect-TS/effect/commit/c8a9f8543de5a93e021e1738af248b2f4e0a5b63), [`0c0aa5e`](https://github.com/Effect-TS/effect/commit/0c0aa5ebb0b833435156c63536be0a967cbe19a4), [`d426feb`](https://github.com/Effect-TS/effect/commit/d426feb658448593980da79937b6456fbef4a258), [`2a8f5c7`](https://github.com/Effect-TS/effect/commit/2a8f5c748d83d8de22bf865618aa76ec77b000b2), [`6332de2`](https://github.com/Effect-TS/effect/commit/6332de29a8138cf220576656b418eda17aa1c4ba), [`c00c8ff`](https://github.com/Effect-TS/effect/commit/c00c8ffd48fe17f40ec1ba56a27bf1f2efed31b8), [`aa7de26`](https://github.com/Effect-TS/effect/commit/aa7de2663104e65677ec69a4a47f5df9a3adadc7), [`6f44ca0`](https://github.com/Effect-TS/effect/commit/6f44ca0b98b27a4222c677bf0b89e85a16790ebb), [`98792c3`](https://github.com/Effect-TS/effect/commit/98792c3bf8bf80237362c51505fc080d2a89ac1d), [`1f76040`](https://github.com/Effect-TS/effect/commit/1f760401be854f8e50c414902be6eeea1d479682), [`cf7cfd6`](https://github.com/Effect-TS/effect/commit/cf7cfd6144faac0c0a4c236382706f38e246795d), [`6bc0eee`](https://github.com/Effect-TS/effect/commit/6bc0eeea42fa557cab193c84646d2c4dae7f5b20), [`88b79d7`](https://github.com/Effect-TS/effect/commit/88b79d74f19567de3fb00c84e71df9f21455fe95), [`db7b69e`](https://github.com/Effect-TS/effect/commit/db7b69efffa6b3c104dbe5f6f1192db5630df272), [`43bbb25`](https://github.com/Effect-TS/effect/commit/43bbb257c22d5a819e423526a358091be629206b), [`6ecd4b3`](https://github.com/Effect-TS/effect/commit/6ecd4b380947ff4db0e8f2144c330526824e67d7), [`7b81a95`](https://github.com/Effect-TS/effect/commit/7b81a95de1d0666e102ea9b29cd9a1fa05b2649c), [`dd8990b`](https://github.com/Effect-TS/effect/commit/dd8990bb1b3379e5bb09f384005e45b85980fe4d), [`19835f2`](https://github.com/Effect-TS/effect/commit/19835f2b92a9fca55a965903d74dda074b17e8ea), [`1a3eb9e`](https://github.com/Effect-TS/effect/commit/1a3eb9ea60dcfcfe09406bf0b766f806883cbf87)]:
  - effect@4.0.0-rc.118

## 4.0.0-rc.117

### Patch Changes

- [#8308](https://github.com/Effect-TS/effect/pull/8308) [`106af64`](https://github.com/Effect-TS/effect/commit/106af64cf7117dfad53d3b11b61bb3d17d63bfca) Thanks @tristanz! - Release savepoints after nested transactions succeed or successfully roll back in PostgreSQL, PGlite, MySQL, libSQL, and the Node, Bun, React Native, and WASM SQLite clients. This frees PostgreSQL transaction locks before the outer transaction completes.
  
  Custom SQL clients can opt in through the new `releaseSavepoint` option. Clients that omit it are unchanged.
- Updated dependencies [[`9953c92`](https://github.com/Effect-TS/effect/commit/9953c92b860061ec928098b121279087ee56e5e9), [`c6e8b20`](https://github.com/Effect-TS/effect/commit/c6e8b20c27b08e94549a9431c38e867aa014b724), [`8d40572`](https://github.com/Effect-TS/effect/commit/8d40572de3762d51b142cfff30e6927ef21e37a3), [`1b21e0d`](https://github.com/Effect-TS/effect/commit/1b21e0df6ab777d6a1664dfabdea88511f2d25d1), [`3b155e3`](https://github.com/Effect-TS/effect/commit/3b155e3e24e42b603d48dff5d3280715944998f0), [`895d944`](https://github.com/Effect-TS/effect/commit/895d94410f90c45546aec593730e5630f200ca1b), [`705fb68`](https://github.com/Effect-TS/effect/commit/705fb6852ac24791352bd78889d57f07cbe949a9), [`87912c0`](https://github.com/Effect-TS/effect/commit/87912c014132648694015a5636177b2ba2bdeb2a), [`106af64`](https://github.com/Effect-TS/effect/commit/106af64cf7117dfad53d3b11b61bb3d17d63bfca), [`1b21e0d`](https://github.com/Effect-TS/effect/commit/1b21e0df6ab777d6a1664dfabdea88511f2d25d1), [`3d59ae6`](https://github.com/Effect-TS/effect/commit/3d59ae6d5f9ff3e52cb6ed4a9f325320580218d5), [`89c9a39`](https://github.com/Effect-TS/effect/commit/89c9a398412f1f5e7f9c6f697a1badd982bcd741)]:
  - effect@4.0.0-rc.117

## 4.0.0-rc.116

### Patch Changes

- Updated dependencies [[`c19c63f`](https://github.com/Effect-TS/effect/commit/c19c63fb710422aaf00b8d923188aa2e52a6776f), [`8cb0a4f`](https://github.com/Effect-TS/effect/commit/8cb0a4f28fba991e15659d08ecc09da28cf742d2), [`8f420bb`](https://github.com/Effect-TS/effect/commit/8f420bb3dc3c9be8c4a48d57dccee201dcb0260d), [`1393080`](https://github.com/Effect-TS/effect/commit/1393080f1cc8f47d459119fcb759e2cc00fd7356), [`ccae354`](https://github.com/Effect-TS/effect/commit/ccae35423188f58d7c3dec5db3e36ed4bf42bcdf), [`553c403`](https://github.com/Effect-TS/effect/commit/553c403f1d9199df738f73446dacd090da2e698b), [`45b5103`](https://github.com/Effect-TS/effect/commit/45b510352d42ac55718f9f5f43573975b323143f), [`77a5612`](https://github.com/Effect-TS/effect/commit/77a56120354d1d3f7341b117266f211143a3734a), [`1076170`](https://github.com/Effect-TS/effect/commit/10761707b5cae0a66ef605abd1737ae59a18f5ac), [`f110af1`](https://github.com/Effect-TS/effect/commit/f110af1ac5a54a7d62c2b96e35d4521a09f3fa06), [`0045152`](https://github.com/Effect-TS/effect/commit/0045152cdf796f20be5e690c69c40da611f813b8), [`51d4a2f`](https://github.com/Effect-TS/effect/commit/51d4a2f08a5c7691dc876415bc9fc0ecf467e153), [`4d4c4e8`](https://github.com/Effect-TS/effect/commit/4d4c4e8a4436d49997a5a7234860ede651467537), [`ccfe152`](https://github.com/Effect-TS/effect/commit/ccfe152d11bed497f2d26aba8ef1a3613d0d6746), [`d30a0c8`](https://github.com/Effect-TS/effect/commit/d30a0c880f8ffe06d7f0695c17f35910f1fcfbc9), [`84fe64a`](https://github.com/Effect-TS/effect/commit/84fe64a5fbfdecd23b66c207d0daa848d59dd825), [`49e4b37`](https://github.com/Effect-TS/effect/commit/49e4b37b831a573567e0b67d3ec4593403dc2e72), [`49e4b37`](https://github.com/Effect-TS/effect/commit/49e4b37b831a573567e0b67d3ec4593403dc2e72), [`a2c4154`](https://github.com/Effect-TS/effect/commit/a2c4154cf8bcbe455bd43bf7f3f12d9cbf38247c), [`23a58c0`](https://github.com/Effect-TS/effect/commit/23a58c020b25dde573ce523c2d157032676de0a3), [`feef90c`](https://github.com/Effect-TS/effect/commit/feef90ccbd86e5ab49b7e3cc3845591e23bdcb1b), [`755e863`](https://github.com/Effect-TS/effect/commit/755e863a793e5621183e7992cb3f85d29030ad7b), [`49e4b37`](https://github.com/Effect-TS/effect/commit/49e4b37b831a573567e0b67d3ec4593403dc2e72), [`9ad9891`](https://github.com/Effect-TS/effect/commit/9ad9891e24058065bcd445772e005f8ce4b3e42f), [`0beded0`](https://github.com/Effect-TS/effect/commit/0beded04f5cffe8dd263f989c38a609e27f27fa5), [`2940742`](https://github.com/Effect-TS/effect/commit/2940742c3f8529bc3b024b379904fbefd40ece55), [`63c1566`](https://github.com/Effect-TS/effect/commit/63c15662f90ae970969de29761207c99ecdbf66b)]:
  - effect@4.0.0-rc.116

## 4.0.0-rc.115

### Patch Changes

- Updated dependencies [[`657254b`](https://github.com/Effect-TS/effect/commit/657254b8218628b0116497d09aaf783cb88279f3), [`f9ef0e9`](https://github.com/Effect-TS/effect/commit/f9ef0e970260b5de143392d00593e6c8b4614cff), [`4f73f9e`](https://github.com/Effect-TS/effect/commit/4f73f9e0bd9538260f0f7166e0e6abdbd507a0e8)]:
  - effect@4.0.0-rc.115

## 4.0.0-rc.114

### Patch Changes

- Updated dependencies [[`3ff4952`](https://github.com/Effect-TS/effect/commit/3ff49521afa6fe6c85c2c230f7e986f7374ef353), [`6d55555`](https://github.com/Effect-TS/effect/commit/6d55555b83701c42855758944985a6fdbf57fffe), [`716e0c0`](https://github.com/Effect-TS/effect/commit/716e0c00942b42d36631b3114b1deb9a4a944ce3), [`d4e4ad5`](https://github.com/Effect-TS/effect/commit/d4e4ad57d06d0a30d5e8090ed951f080bcd3a3d7), [`b1988f4`](https://github.com/Effect-TS/effect/commit/b1988f496eef07482f10f4cc03ef20b9570ea0ac), [`482b7d7`](https://github.com/Effect-TS/effect/commit/482b7d7eb08ebe6bc57781414a5a9a12600b2c71), [`716e0c0`](https://github.com/Effect-TS/effect/commit/716e0c00942b42d36631b3114b1deb9a4a944ce3), [`9941e6d`](https://github.com/Effect-TS/effect/commit/9941e6dbf800cfd3723bfb421306e04e36b5882d)]:
  - effect@4.0.0-rc.114

## 4.0.0-rc.113

### Patch Changes

- [#8096](https://github.com/Effect-TS/effect/pull/8096) [`cce221e`](https://github.com/Effect-TS/effect/commit/cce221ebf450bbcf067f73bce98598303f6e4798) Thanks @tim-smart! - Update dependencies to their latest compatible versions.

- [#7829](https://github.com/Effect-TS/effect/pull/7829) [`b4d8183`](https://github.com/Effect-TS/effect/commit/b4d81832be7cefd1c5b3bfae8e3d12bda74a5184) Thanks @kitlangton! - Isolate transaction contexts between separately created libSQL clients.
- Updated dependencies [[`49e3901`](https://github.com/Effect-TS/effect/commit/49e39010ff84acbde32c50d559a2f76426cf830e), [`b945ded`](https://github.com/Effect-TS/effect/commit/b945ded23aa9a0ad88bb55aa4089680866dccf92), [`d6422f4`](https://github.com/Effect-TS/effect/commit/d6422f4104062e3e176abe92ef0e444cd4cc6bab), [`5a80204`](https://github.com/Effect-TS/effect/commit/5a802043984727b0c5a291af39d1b9bbfa8d7b8b), [`53511ef`](https://github.com/Effect-TS/effect/commit/53511efcd1c7a05d34b4c9a19c19ed317ebc5d4c), [`79ae49f`](https://github.com/Effect-TS/effect/commit/79ae49f19cab9a42c8f27ae8b104d5e39e6131fa), [`0d083ba`](https://github.com/Effect-TS/effect/commit/0d083ba26b2e1afec8d3e8d83db0d05683b6602b), [`be0f822`](https://github.com/Effect-TS/effect/commit/be0f8221e37abd52668567b60fc1be28e3ff3803), [`debe8fd`](https://github.com/Effect-TS/effect/commit/debe8fdc15d00d51cf707353365d7b877123eec6), [`a8588f9`](https://github.com/Effect-TS/effect/commit/a8588f99a43dc9b85dacb14f7be5d3e1ed994d4f), [`f17eb0a`](https://github.com/Effect-TS/effect/commit/f17eb0a6f669e09647c5ded5832ea6baac596659), [`f30cbfe`](https://github.com/Effect-TS/effect/commit/f30cbfe53951128ad8124ae733f12423dbc78bd8), [`78cc9c0`](https://github.com/Effect-TS/effect/commit/78cc9c0d0f36b59f7034b2ace56a4a5c02b7a551), [`ccbdbd5`](https://github.com/Effect-TS/effect/commit/ccbdbd51e7bdb114302701fbc03021868b71956a), [`a63dcbf`](https://github.com/Effect-TS/effect/commit/a63dcbf04e5c3d8d934a41bc6122e9951b1cefa9), [`b845b18`](https://github.com/Effect-TS/effect/commit/b845b186379106c17ed4b1149e2462cd0d2d77b5), [`381b794`](https://github.com/Effect-TS/effect/commit/381b79464f8e0a520585fdcfdd3e95e0553d0b27), [`4ffcaf4`](https://github.com/Effect-TS/effect/commit/4ffcaf4c4a94d3d9d5715db91aa37d7f5d9ecd99), [`ba2fd82`](https://github.com/Effect-TS/effect/commit/ba2fd822e9618f30d0f430ae4eed2eaa4813e2e3), [`02be94c`](https://github.com/Effect-TS/effect/commit/02be94ce78a3c9fc1e4c516d37d8e11e1c0eef2e), [`115d8c2`](https://github.com/Effect-TS/effect/commit/115d8c22599640ece2fd6a10564925b1d79f8a8c), [`1452635`](https://github.com/Effect-TS/effect/commit/14526354f3d0288bd1d0a85c8d4aeee8abe2cd9b), [`77f85fe`](https://github.com/Effect-TS/effect/commit/77f85fe1613348f5c990016b49dc97e252576c82), [`a3f2b31`](https://github.com/Effect-TS/effect/commit/a3f2b319343f28edb028270f7074066cea0ec429), [`310f8d3`](https://github.com/Effect-TS/effect/commit/310f8d3424a025ce1f1cc5c338232db2362052d8), [`291d616`](https://github.com/Effect-TS/effect/commit/291d616282b666bbba3664143fa1d19e839a6a5d), [`48dbbb2`](https://github.com/Effect-TS/effect/commit/48dbbb22bb2e04f63992fc267dd711a0cbd76d72), [`b43bfd6`](https://github.com/Effect-TS/effect/commit/b43bfd644a3205f1518abbfd006f761e31b3a5f9), [`1c89c78`](https://github.com/Effect-TS/effect/commit/1c89c78f9faa3638f398772f3ed7182aa97a1edd), [`9bbe1a5`](https://github.com/Effect-TS/effect/commit/9bbe1a5940eee4642ffe854356128b617e0a064c), [`dd99ab0`](https://github.com/Effect-TS/effect/commit/dd99ab007e3352761187dae330d52f65feeff7c0), [`8f397ed`](https://github.com/Effect-TS/effect/commit/8f397ed4e7852026591819cc4c8c1995bdd2fb8c), [`d7ae6b6`](https://github.com/Effect-TS/effect/commit/d7ae6b6491a88f2710612bfcddaf608ebe925f7c), [`8cf1203`](https://github.com/Effect-TS/effect/commit/8cf12030e8a3e1e76384884d41afa96e2bd72b13), [`87654c5`](https://github.com/Effect-TS/effect/commit/87654c5eed150387f4eac7153751b6085616ba52), [`f05ae0b`](https://github.com/Effect-TS/effect/commit/f05ae0b3fd2cfc7f12b668af244b3cf3fae59bc5), [`436f5eb`](https://github.com/Effect-TS/effect/commit/436f5eb44aa234bdf1de37b07da2ce8dc31ad4ec), [`d8ff960`](https://github.com/Effect-TS/effect/commit/d8ff9605bb5ef7b0cacd80e3b43ed1ce9e3d5e36), [`8766475`](https://github.com/Effect-TS/effect/commit/876647502300b9fb79d163de10fd497716d93be0), [`b64f406`](https://github.com/Effect-TS/effect/commit/b64f406de13a1b9da4664dbde2dbddaa5f776a05), [`4697aaa`](https://github.com/Effect-TS/effect/commit/4697aaa1d38f9da7fe0bcb62f708183f766fe496), [`cec6c2d`](https://github.com/Effect-TS/effect/commit/cec6c2d7bec7bea0ea179123af581a23c2e24494), [`9956f0e`](https://github.com/Effect-TS/effect/commit/9956f0e6f47096a6e31305ec2c7320b8e1a140af), [`5c7eed0`](https://github.com/Effect-TS/effect/commit/5c7eed0c5aa0988716206dd374359223edf828ee), [`183c2ea`](https://github.com/Effect-TS/effect/commit/183c2ea65ee1e9b967c746aa1b0bf2b8d3422de2), [`1e92dbd`](https://github.com/Effect-TS/effect/commit/1e92dbd26f5a74bb32103cbaac0f09460b7954de), [`4eb0fa7`](https://github.com/Effect-TS/effect/commit/4eb0fa72302b0a63ac34c6515a9cdf96338e586a), [`534b8b9`](https://github.com/Effect-TS/effect/commit/534b8b9dba195ec38a4795fe564d5e0876cb6468), [`b76a1cf`](https://github.com/Effect-TS/effect/commit/b76a1cf32b0a742c24c1874137e2da8fed5c48eb), [`acc1e53`](https://github.com/Effect-TS/effect/commit/acc1e5384aa5cb7b072f60308013f078b0099bdf), [`4950a91`](https://github.com/Effect-TS/effect/commit/4950a914a68306531a1111d4cdc4504aa8d3854e), [`c020987`](https://github.com/Effect-TS/effect/commit/c020987a0611c9e610a7eef347648b60026745b8), [`abe95d1`](https://github.com/Effect-TS/effect/commit/abe95d12340e1dd435e5df623b1967bf01938c94), [`027ceb9`](https://github.com/Effect-TS/effect/commit/027ceb91e003fbc36f0559f72e1c614cd9198c1a), [`3d203b7`](https://github.com/Effect-TS/effect/commit/3d203b702e26687d2fea4aaae7cc01dcfb82c05e), [`a29b8f4`](https://github.com/Effect-TS/effect/commit/a29b8f4de5aee58dd9ee645365c04cfe1ea6fa9f), [`ce4aa65`](https://github.com/Effect-TS/effect/commit/ce4aa65409e8500908fb6496eca06270ef5b636f), [`a8ea807`](https://github.com/Effect-TS/effect/commit/a8ea80799a0bf187c577e052fef0b7245494c7bf), [`a3ebb7f`](https://github.com/Effect-TS/effect/commit/a3ebb7fcb208f3933a40a0fd949dbcfdf1ca2921), [`473bd81`](https://github.com/Effect-TS/effect/commit/473bd814a97dba66070435cfe84933bcc143effe), [`53843f6`](https://github.com/Effect-TS/effect/commit/53843f6490f4eebaf1eeb91fdcc5f1c542b0e132), [`c5eca65`](https://github.com/Effect-TS/effect/commit/c5eca6539f0d605acd5ce19437fa88f167d69bb7), [`d6f9eba`](https://github.com/Effect-TS/effect/commit/d6f9eba7e8df0c8bd74762c313402884d94ba146), [`8d1e97a`](https://github.com/Effect-TS/effect/commit/8d1e97adbf5a36b4b53ab56f797c2ec0267a8821), [`b28ab48`](https://github.com/Effect-TS/effect/commit/b28ab48be7cf7f2bd30f9467ccac0ab41260f7ad), [`9960708`](https://github.com/Effect-TS/effect/commit/9960708052fcaaa873c471aea144ca46955e6023), [`8ac53b6`](https://github.com/Effect-TS/effect/commit/8ac53b6ae677f06d88d7d81f932ab5ff9b59a10e), [`84ad49a`](https://github.com/Effect-TS/effect/commit/84ad49a357ef156b4ff46cefc945efbe3e292eff), [`72cfa24`](https://github.com/Effect-TS/effect/commit/72cfa2420977919ba57a8e6de538e01e06d5f380), [`95c2581`](https://github.com/Effect-TS/effect/commit/95c2581e0f78e1537aad21764fe562206ca50adb), [`d5c7cd2`](https://github.com/Effect-TS/effect/commit/d5c7cd2c47b2b01523aaea48d2dd039b89b36114), [`fe4fed1`](https://github.com/Effect-TS/effect/commit/fe4fed1b014c78043a8efe37520c527100910010), [`d150a64`](https://github.com/Effect-TS/effect/commit/d150a643c4f60da2dc19ae813b807d48b580087e), [`05b1e80`](https://github.com/Effect-TS/effect/commit/05b1e80cde3a8da1ff1afe288f8539b72c05bb87), [`414dc90`](https://github.com/Effect-TS/effect/commit/414dc9056a39aa22f7cc27aeb5e631231ce50982), [`3f51acd`](https://github.com/Effect-TS/effect/commit/3f51acdf5e2490d7d0a833cd67ce06d1d867facd), [`d68ff05`](https://github.com/Effect-TS/effect/commit/d68ff05506ab5bb3ec07e1b759ce296423b0dbbe), [`f3cf1e6`](https://github.com/Effect-TS/effect/commit/f3cf1e6c36f1aac8399d9b540aecb6410be3096f), [`6525771`](https://github.com/Effect-TS/effect/commit/6525771eef7df6b71a3ef6e299ee93d798ed3dda), [`4ab4e83`](https://github.com/Effect-TS/effect/commit/4ab4e838a4c9ab3c9cc0d52d3e83de88686601b0), [`f7f1d78`](https://github.com/Effect-TS/effect/commit/f7f1d78e52023bdfbebf76949c550db8bb9411dd), [`47b358a`](https://github.com/Effect-TS/effect/commit/47b358a4b85d22973a7957abd1a859f65b75b7da), [`45ffa72`](https://github.com/Effect-TS/effect/commit/45ffa7221259c7e4be9797b90f6ca569fe7ec8a3), [`6232650`](https://github.com/Effect-TS/effect/commit/62326505a74fcd8fe27c8e2064128d2dea484ecc), [`4b73e1b`](https://github.com/Effect-TS/effect/commit/4b73e1bd5576346d7939be8915f3053e428d1c0e), [`284050c`](https://github.com/Effect-TS/effect/commit/284050c2aa6e78eceb08e5eff1803501cc80a658), [`c85fc0b`](https://github.com/Effect-TS/effect/commit/c85fc0b8f2195780929d6fc8ecdc084faf18736c), [`7999b07`](https://github.com/Effect-TS/effect/commit/7999b078950fda15e235db1e61e8db5eb0632528), [`7d455f5`](https://github.com/Effect-TS/effect/commit/7d455f51acf2f0e9f710f298e14e4d81179a9259), [`d681c2e`](https://github.com/Effect-TS/effect/commit/d681c2eb1bb07d782540286368e8b42533df3063), [`84d2a47`](https://github.com/Effect-TS/effect/commit/84d2a470ecc0fcad7f1d1e7a50464e02af0e6972), [`ed74b18`](https://github.com/Effect-TS/effect/commit/ed74b18b95b0797808f2f7928f413f1cf2279d77), [`2245997`](https://github.com/Effect-TS/effect/commit/2245997ad2214591b7d9674777595092926743cf), [`d386979`](https://github.com/Effect-TS/effect/commit/d386979fedbdd433d28816f9cc74675a9af45189), [`fc9fedf`](https://github.com/Effect-TS/effect/commit/fc9fedf59fc26a8bc6e45c3860a921f3b7e0f971), [`7750dbe`](https://github.com/Effect-TS/effect/commit/7750dbe0d5b9929c6d92b0365b42784b993ea2a6), [`fc91af6`](https://github.com/Effect-TS/effect/commit/fc91af659d0682659e6347eede288f90f618acc0), [`39b9738`](https://github.com/Effect-TS/effect/commit/39b9738727ab4d87298fd640edd138f352c70ee3), [`88093b5`](https://github.com/Effect-TS/effect/commit/88093b57951a1b597599fe4772ab690b36a95818), [`d14c463`](https://github.com/Effect-TS/effect/commit/d14c4631ac82911a8ca0b6c24c14ecb95863ee6b), [`d473bd3`](https://github.com/Effect-TS/effect/commit/d473bd3ee966a3a0c245d0e3c752fd91368b8ff6), [`84864bc`](https://github.com/Effect-TS/effect/commit/84864bc30c9e92a1226f65bb78b0641a7e0acea2), [`e2ae724`](https://github.com/Effect-TS/effect/commit/e2ae72481e755a454f28ce45e90f43b857b7c6e5), [`f921ed3`](https://github.com/Effect-TS/effect/commit/f921ed305c63415dc468e94d9319cc3237119138), [`1df933d`](https://github.com/Effect-TS/effect/commit/1df933d1dee2e09a25f9c27214b31aa94fa9d020), [`829aff9`](https://github.com/Effect-TS/effect/commit/829aff97d71d7900b7765ba2f63e33874b898cdc), [`aa0aba3`](https://github.com/Effect-TS/effect/commit/aa0aba383382ca1b99fbe618dceba63c3a5a6a53), [`a71140f`](https://github.com/Effect-TS/effect/commit/a71140fbe79809aa5311a55b1c6908905dc2df26), [`0276a27`](https://github.com/Effect-TS/effect/commit/0276a27ddbb15d163daf56f059ca9f62c4fd9939), [`10d2c98`](https://github.com/Effect-TS/effect/commit/10d2c983a80d19b84fb52f33c7f719ebd81746bb), [`c86c999`](https://github.com/Effect-TS/effect/commit/c86c99939e1628813a2f92f0906cfbbe924504e8), [`975f758`](https://github.com/Effect-TS/effect/commit/975f7586f3dcda5743d6570a740013a9fbdce9a7), [`2a3a478`](https://github.com/Effect-TS/effect/commit/2a3a4783bcd2d4e91e3505c7a6c1e398fea89595), [`1e6e206`](https://github.com/Effect-TS/effect/commit/1e6e206f6327a114f55a541775f465c0bc9fbf3e), [`fa6027b`](https://github.com/Effect-TS/effect/commit/fa6027b16e65376078e526fa33116ac0cc82485b), [`7616f73`](https://github.com/Effect-TS/effect/commit/7616f73c16bd45a3a3e2202d3f81c6d1cc63f4e0), [`fc668b6`](https://github.com/Effect-TS/effect/commit/fc668b61e9755545a47582dee6c4425d5652cbb6), [`d425c8c`](https://github.com/Effect-TS/effect/commit/d425c8c1319519e861714bcb9d055b63a9434fad), [`ce120f4`](https://github.com/Effect-TS/effect/commit/ce120f474b87d8a5a787dd7f848177ecd3b960fc), [`248201f`](https://github.com/Effect-TS/effect/commit/248201f7846d855685a4dc1b2f01968981706d69), [`e80d397`](https://github.com/Effect-TS/effect/commit/e80d3972fcca4e986b6497d67406f45ee1be540d), [`f1a941d`](https://github.com/Effect-TS/effect/commit/f1a941d52c2f71973e998883869e4e9ef510abf2), [`73bc3a1`](https://github.com/Effect-TS/effect/commit/73bc3a13b6e1b7a060e6bcd19ae7796443211a80), [`b628bb1`](https://github.com/Effect-TS/effect/commit/b628bb1240a09df2244c3ff6c587f978feb25225), [`6e3ae7b`](https://github.com/Effect-TS/effect/commit/6e3ae7b6359bda08cea74b761fd54224d7af45e2), [`e891247`](https://github.com/Effect-TS/effect/commit/e8912473bd4128714a0f8cb04621f3e12f62a910), [`53e6c73`](https://github.com/Effect-TS/effect/commit/53e6c7311b948a62e93e57f6daee66a8ec24b030), [`1579d6f`](https://github.com/Effect-TS/effect/commit/1579d6fd063e444e4fcdfd08ff194c7485203f9c), [`d3c6b73`](https://github.com/Effect-TS/effect/commit/d3c6b73cc4b78f22fdb2e25c8bebda027551540b), [`4a59c6a`](https://github.com/Effect-TS/effect/commit/4a59c6a559e69d399b00c6acd48c8e1977e34875), [`145d8e1`](https://github.com/Effect-TS/effect/commit/145d8e1013220425b8edf34f7011c73f73e1cdcf), [`f74282c`](https://github.com/Effect-TS/effect/commit/f74282cb08de808b678ce67687acbcd61939d2f6), [`0a38623`](https://github.com/Effect-TS/effect/commit/0a3862349ebfbc41746aa0de5e682992719c1da6), [`0a08ae0`](https://github.com/Effect-TS/effect/commit/0a08ae0626f8124779ec2e32ae2088d28db157c6), [`fa6a56b`](https://github.com/Effect-TS/effect/commit/fa6a56b862229cfb699e076bac50e3b737ae3c72), [`d60c5d4`](https://github.com/Effect-TS/effect/commit/d60c5d40b5954ea1557aef1502b4b87f98bbf134), [`07ffd25`](https://github.com/Effect-TS/effect/commit/07ffd25bd0e82c9e6b72b8e669833fb4531a9da3), [`9b517ad`](https://github.com/Effect-TS/effect/commit/9b517ad28a0c2f213693bcab408658c40e3b6d9b), [`604b1c1`](https://github.com/Effect-TS/effect/commit/604b1c109d6c9e654b9b7fcc98d6b80361400325), [`ccc2e02`](https://github.com/Effect-TS/effect/commit/ccc2e02def5965f5535ca97fac2051f4387c4e13), [`14d810a`](https://github.com/Effect-TS/effect/commit/14d810a726caad8a7b0d42f04a6876f25fbcc005), [`a9d1ee3`](https://github.com/Effect-TS/effect/commit/a9d1ee3d4d51e97ea33440fe6100935d5fd5aada), [`a31adbe`](https://github.com/Effect-TS/effect/commit/a31adbefd6c04c70536de11433edba9edd1f5013), [`7245f87`](https://github.com/Effect-TS/effect/commit/7245f87ace09806d15893df8f0bac8f0b9b817db), [`3a0828b`](https://github.com/Effect-TS/effect/commit/3a0828b058abb4b4646bd880458b4e636d77d1c3), [`cd83544`](https://github.com/Effect-TS/effect/commit/cd83544dd594b99e8ea0d7a7645c086f5861769b), [`6550a07`](https://github.com/Effect-TS/effect/commit/6550a074c5c501d8a95dcd354f17e9785a1ae1eb), [`6f090d4`](https://github.com/Effect-TS/effect/commit/6f090d4c2032cc35f7f9a9eac900d0329b8ac07e), [`b505c0d`](https://github.com/Effect-TS/effect/commit/b505c0db03e86eb126237690a5867f457eb4237f), [`186dd49`](https://github.com/Effect-TS/effect/commit/186dd4914084fa346a870ce9c637b9c2a6cc8100), [`9f37e58`](https://github.com/Effect-TS/effect/commit/9f37e58d00e06150d96af48fffe780947ca0d519), [`4446451`](https://github.com/Effect-TS/effect/commit/44464510114773e1ebd1abb6efffa382cf69998e), [`58be972`](https://github.com/Effect-TS/effect/commit/58be97238ee1f6cd26f6a3a645d1df97a091a224), [`1320075`](https://github.com/Effect-TS/effect/commit/1320075fd4ed381f60f6f37f280dbec17cb29b81), [`ba53b64`](https://github.com/Effect-TS/effect/commit/ba53b646e9dad9b39fd6cf5b2d89de9bf858bb80), [`f7490d4`](https://github.com/Effect-TS/effect/commit/f7490d49c75b99118c6c42549511ffa166459f59), [`c8ea602`](https://github.com/Effect-TS/effect/commit/c8ea60231ad69e23c0bf319f6f6b3ff28fc45e4b), [`62d82f4`](https://github.com/Effect-TS/effect/commit/62d82f4919c72d8cc0cfd2b704ed6900f69ad9a8), [`a2c9e7c`](https://github.com/Effect-TS/effect/commit/a2c9e7c17a4118b74a1eab3332042dafe0bb7318), [`97dd022`](https://github.com/Effect-TS/effect/commit/97dd022fe7fbd1696dd60f3319eae594abdd3760), [`f984ee8`](https://github.com/Effect-TS/effect/commit/f984ee82d255c7958eeed6f0dd08de1b88cbbfd6), [`f1b2910`](https://github.com/Effect-TS/effect/commit/f1b291027c3055f801c2f288dda21ba84c361956), [`a29e05a`](https://github.com/Effect-TS/effect/commit/a29e05a907053a8617763b4e7408e1f012b59049), [`1aa1d8b`](https://github.com/Effect-TS/effect/commit/1aa1d8bd0f2c2d429938657927f34f8ff0f940a0), [`bb99734`](https://github.com/Effect-TS/effect/commit/bb99734ef87bcc377c628bc4072aa856ce5f7ca6), [`222e7ca`](https://github.com/Effect-TS/effect/commit/222e7caa4bb0da6d81a4eabf25dffc181c20f6a3), [`797c9e3`](https://github.com/Effect-TS/effect/commit/797c9e3c1f2e66db1570cf6aa5c4a15e94507bf0), [`b4d5398`](https://github.com/Effect-TS/effect/commit/b4d5398598c04a84054a55873c943d587880058d), [`c8349ed`](https://github.com/Effect-TS/effect/commit/c8349ede1a2add807e9ec9c37612b3a39bf284f8), [`8426e5f`](https://github.com/Effect-TS/effect/commit/8426e5f7ad11f15e39565cf8ba0874bf974f5085), [`26e0085`](https://github.com/Effect-TS/effect/commit/26e0085d098f6e526c085c357b8d82ee068b6518), [`1a86166`](https://github.com/Effect-TS/effect/commit/1a86166f102b517ee4d89dca0095e28f738eee10), [`0856631`](https://github.com/Effect-TS/effect/commit/0856631a89d8f72d206c366905ddac75468a8e85), [`0af0985`](https://github.com/Effect-TS/effect/commit/0af0985d5c132b33e14a2df59e0567d7ba2a1710), [`bc582c9`](https://github.com/Effect-TS/effect/commit/bc582c94313cbb89d87b3844ffffabebbb4ffa83), [`2c63f1e`](https://github.com/Effect-TS/effect/commit/2c63f1e07e375b7958e14929c6a4b358c819a9d0), [`0d98213`](https://github.com/Effect-TS/effect/commit/0d9821346453d44696258103643d5482e63638b4), [`ca6f0dc`](https://github.com/Effect-TS/effect/commit/ca6f0dc4fcea564b351bf505df015d16a8b965ed), [`d8cc9ed`](https://github.com/Effect-TS/effect/commit/d8cc9ed80e1df9c056a46ba62df01f7fc0f531c3), [`42fd969`](https://github.com/Effect-TS/effect/commit/42fd969b45025eed6d60cb87b97c5ff88d187671), [`5641ad3`](https://github.com/Effect-TS/effect/commit/5641ad333a88bb9e56baf886006682678391be0a), [`629870d`](https://github.com/Effect-TS/effect/commit/629870d461b36d3dacb30c8d203b8d20d4beaba0), [`d592c14`](https://github.com/Effect-TS/effect/commit/d592c1492ad895ea72537e10387b735f3ba0e7de), [`10d2c98`](https://github.com/Effect-TS/effect/commit/10d2c983a80d19b84fb52f33c7f719ebd81746bb), [`53909a9`](https://github.com/Effect-TS/effect/commit/53909a9bf14b29725a08dcccde02bee8e95a6b14), [`78a4269`](https://github.com/Effect-TS/effect/commit/78a42697f6085c87c09b18e8095bb7541bd65261), [`06c6307`](https://github.com/Effect-TS/effect/commit/06c6307d3d5538bc398c67a44239bc3d52ab1a4d), [`0847c41`](https://github.com/Effect-TS/effect/commit/0847c41e2472a347cd8f77d460d3cbdfecd4adf0), [`5a77084`](https://github.com/Effect-TS/effect/commit/5a77084651bc58617b9988606473cf9ba5ca0032), [`96f99b3`](https://github.com/Effect-TS/effect/commit/96f99b325da32bfa535e826d89d838d0edec0dea), [`7bb8781`](https://github.com/Effect-TS/effect/commit/7bb878176b8ad20cf0e671b570caf72e194f9515), [`4907e9b`](https://github.com/Effect-TS/effect/commit/4907e9b2470894ddaf0cbdec2612b59f04a51dbe), [`2a30248`](https://github.com/Effect-TS/effect/commit/2a30248b6eb739f22403456209bc468f2f4ef26a), [`8364ddd`](https://github.com/Effect-TS/effect/commit/8364ddda233d35ee472cc2356312317a60a148a2), [`ad67d8c`](https://github.com/Effect-TS/effect/commit/ad67d8c5a1b195ff5468a9f2e963c59aa0b3166f), [`ec0c087`](https://github.com/Effect-TS/effect/commit/ec0c0875262fb81c7992f5023776b8fa894c49b6), [`fa6a56b`](https://github.com/Effect-TS/effect/commit/fa6a56b862229cfb699e076bac50e3b737ae3c72), [`a2c1ce6`](https://github.com/Effect-TS/effect/commit/a2c1ce62f04214d98d848f4cfe33d677e1a87d39), [`91e9af0`](https://github.com/Effect-TS/effect/commit/91e9af0d5f138933d3a131ca1cfbc52d3bc55481), [`7bd3f34`](https://github.com/Effect-TS/effect/commit/7bd3f34385a06157b249a351e32ffdcbe1cf2c37), [`ef16581`](https://github.com/Effect-TS/effect/commit/ef165814eae0a199fdca5b3c2839bb4fcdfd5b5d), [`1693a87`](https://github.com/Effect-TS/effect/commit/1693a877324273f5a23fa7d7fc892f4ee12f20c2), [`df3fc47`](https://github.com/Effect-TS/effect/commit/df3fc47609eda7843dae2b557c8fe834299e26b4), [`e11be41`](https://github.com/Effect-TS/effect/commit/e11be41dfc73fa6b5643ab9af7df18d6907927d7), [`2e39e8b`](https://github.com/Effect-TS/effect/commit/2e39e8bafef7d3fee9f3b324b7d50cc064376667), [`11c5ee7`](https://github.com/Effect-TS/effect/commit/11c5ee7202acd3bb789d0a8ce78e6c4523071553), [`1742d2f`](https://github.com/Effect-TS/effect/commit/1742d2f48441cb7b1a8d9aca3a8e6f0acbc35a96), [`8efc70e`](https://github.com/Effect-TS/effect/commit/8efc70ea16bee43fd9adde2871cf82a8131b80a0), [`9642776`](https://github.com/Effect-TS/effect/commit/964277661423f398f777ec2eab4b3ecc0b53f53b), [`6680828`](https://github.com/Effect-TS/effect/commit/668082885f52672e4c7fad4e0fe2bfa0e69703e2), [`c34edcb`](https://github.com/Effect-TS/effect/commit/c34edcb6d7a6151d53e19828c92abf7dd8450c2a), [`7b2c5bd`](https://github.com/Effect-TS/effect/commit/7b2c5bd3c394fa4751fb229394ac9c03e401f441), [`1a2ccee`](https://github.com/Effect-TS/effect/commit/1a2ccee2bbb93514dc66e0a9cdeb52a82172ab0e), [`db995df`](https://github.com/Effect-TS/effect/commit/db995df19b0381b64cc39b50aa28d7bd8f2c1294), [`af0ccdd`](https://github.com/Effect-TS/effect/commit/af0ccdd13aa8917bce7161b8bc257fbe51c6a6a5), [`addeaea`](https://github.com/Effect-TS/effect/commit/addeaea0b0abe0dc24ca1d4d0fd194a0e458be70), [`7704034`](https://github.com/Effect-TS/effect/commit/770403411bcd8befef0552a0e40066abc417f6ea), [`e72b12f`](https://github.com/Effect-TS/effect/commit/e72b12fc305710550bc6dcb978e92de8abff88cd), [`310dd9c`](https://github.com/Effect-TS/effect/commit/310dd9ce9681e97f558bb042adb35f6040ab81e3), [`1c2afc1`](https://github.com/Effect-TS/effect/commit/1c2afc15bbf4ce5a91d24da99bc275b5bd744e77), [`44f44ca`](https://github.com/Effect-TS/effect/commit/44f44cae65249801c082c3a3848016eeeac5eb24), [`f43b9d6`](https://github.com/Effect-TS/effect/commit/f43b9d6d99cb591c0377bb1474121827201627c9), [`56e72b3`](https://github.com/Effect-TS/effect/commit/56e72b38c01bbe6ec921ad151f83b7849444f219), [`50ef80e`](https://github.com/Effect-TS/effect/commit/50ef80e251b85b5ee63aed06fe0244b5433ec2fa), [`fc3b718`](https://github.com/Effect-TS/effect/commit/fc3b7187114a31cbb21a250f55fda601bb3edcf0), [`ee336d8`](https://github.com/Effect-TS/effect/commit/ee336d80b4024b51654e7a2b8d869d244153fcdf), [`d12f922`](https://github.com/Effect-TS/effect/commit/d12f922853eff2310dbe9fc9b31562ad81b38435), [`46d8310`](https://github.com/Effect-TS/effect/commit/46d83101e8408c0428d9a8760e06e23a69ad6070), [`59812fd`](https://github.com/Effect-TS/effect/commit/59812fd221cde16fc77c03d326c6a2cf8fbec6b9), [`f9d0dec`](https://github.com/Effect-TS/effect/commit/f9d0dec12c5f229f05d7a74d532a85c6bbffefbf), [`4372c79`](https://github.com/Effect-TS/effect/commit/4372c79a32fcecc7b6b284d49a215b2c4fef9d77), [`81485ef`](https://github.com/Effect-TS/effect/commit/81485ef0288a3321e75d7d4ae32b7e0e06b6f86b), [`bd393d6`](https://github.com/Effect-TS/effect/commit/bd393d63c19bdd0ab212d95576cec89051c8501c), [`0c95c04`](https://github.com/Effect-TS/effect/commit/0c95c04b41c2d5d09e4564fd997572207fd72595)]:
  - effect@4.0.0-rc.113

## 4.0.0-rc.112

### Patch Changes

- Updated dependencies [[`20cb4f2`](https://github.com/Effect-TS/effect/commit/20cb4f260e45d37fa417c292c57be015314efe16), [`44675cb`](https://github.com/Effect-TS/effect/commit/44675cbce3dabfb85c68a3703b5de525768336fb), [`b6bf5e1`](https://github.com/Effect-TS/effect/commit/b6bf5e14492643076454131148f97cde24ad5306), [`0b9f780`](https://github.com/Effect-TS/effect/commit/0b9f780ff28b71042241791a9e8bcb5b631be2bd), [`150e92c`](https://github.com/Effect-TS/effect/commit/150e92c4169c245e701da02575eef0b69c3ecd64), [`6740db2`](https://github.com/Effect-TS/effect/commit/6740db247ed20cb85da43c9f48ade8fecfd8c1ae), [`d57bba1`](https://github.com/Effect-TS/effect/commit/d57bba1486fa60971b6e0bf7459a329cfd5acdc4), [`be75d5e`](https://github.com/Effect-TS/effect/commit/be75d5ea6e516c25e3affec25806d31c2b203bc4), [`be75d5e`](https://github.com/Effect-TS/effect/commit/be75d5ea6e516c25e3affec25806d31c2b203bc4), [`be75d5e`](https://github.com/Effect-TS/effect/commit/be75d5ea6e516c25e3affec25806d31c2b203bc4), [`02a5146`](https://github.com/Effect-TS/effect/commit/02a5146d6933c7f6052553550bce5658225e4100), [`15272a6`](https://github.com/Effect-TS/effect/commit/15272a66adf02501e7747761e2a3c41bff67bb46), [`436f10d`](https://github.com/Effect-TS/effect/commit/436f10d1efccec308426532ff3f88df9a96434f3), [`058fb15`](https://github.com/Effect-TS/effect/commit/058fb15647fa01ad771277bd368783fcf5f262e8), [`4d89bb8`](https://github.com/Effect-TS/effect/commit/4d89bb8ffb4cf567a1d11072246b6161ce638712), [`480fb15`](https://github.com/Effect-TS/effect/commit/480fb156590785cf98f67bdec4fc282a608e2d87), [`f77ec19`](https://github.com/Effect-TS/effect/commit/f77ec19cff1cbbeeae928e3bd0ece00a7d22bab8), [`925b82a`](https://github.com/Effect-TS/effect/commit/925b82a81f59a4d459b488621030f24ba99d6a27), [`7455246`](https://github.com/Effect-TS/effect/commit/7455246f352385f5cbbdd8299555265ee289490e), [`118124d`](https://github.com/Effect-TS/effect/commit/118124d913d0a02ac5c1f7799a39bd90031769d9), [`a5f78d3`](https://github.com/Effect-TS/effect/commit/a5f78d3fcbaa792d49e80d103ab438e0b50812fd), [`0dd7825`](https://github.com/Effect-TS/effect/commit/0dd7825e4da4d3a00fa9bd410a1d55f3d4874d07), [`b722eca`](https://github.com/Effect-TS/effect/commit/b722eca6d283a88970ad0efba0b4e921915eca78), [`811d579`](https://github.com/Effect-TS/effect/commit/811d579c432856a9e3fc05b517fd8e924cbf991a), [`043b587`](https://github.com/Effect-TS/effect/commit/043b587e6e93f6624bf974bcd7ed976eaa17f0e1), [`8583727`](https://github.com/Effect-TS/effect/commit/85837274fa929a921985464585513a68c261e365), [`d9d2cfc`](https://github.com/Effect-TS/effect/commit/d9d2cfcb732754001b7323cf8afaccc48539bb74), [`5c4b7a0`](https://github.com/Effect-TS/effect/commit/5c4b7a0b17931cd1538c6595a54b21ffe9c1e906)]:
  - effect@4.0.0-rc.112

## 4.0.0-rc.111

### Patch Changes

- Updated dependencies [[`0ce3b00`](https://github.com/Effect-TS/effect/commit/0ce3b007531563ce33f94c6a057492d379cfd9e8), [`d846331`](https://github.com/Effect-TS/effect/commit/d84633171b4333e87a05f8d74c02c95d83d1b50d), [`f93616f`](https://github.com/Effect-TS/effect/commit/f93616f31f42345af844b8396fb19259556ae236), [`16bf1ef`](https://github.com/Effect-TS/effect/commit/16bf1efdf41ba1d000b8588a8cc052a394856ba4), [`d568968`](https://github.com/Effect-TS/effect/commit/d5689682e963f43157571cd71d4b422247ae09b9), [`bc06292`](https://github.com/Effect-TS/effect/commit/bc062920ac47f956786d12c6d0bacb9468fa66e2), [`e03ea90`](https://github.com/Effect-TS/effect/commit/e03ea907720b58d19d99929695df159c42fff101), [`9b10fc8`](https://github.com/Effect-TS/effect/commit/9b10fc85dde7866fb60e8142a93a6ed6a184537c), [`770c6d0`](https://github.com/Effect-TS/effect/commit/770c6d0f0ddcab7dbdde9fe701aded08deaee3fd), [`7425bcb`](https://github.com/Effect-TS/effect/commit/7425bcb7f74bdccc1941883bc7f9472fbe6ae8b4), [`563815a`](https://github.com/Effect-TS/effect/commit/563815a250e10a02e2a719c7d9b159478b0da933), [`1e83ca1`](https://github.com/Effect-TS/effect/commit/1e83ca110d5cb74641bae148a08e7eb6b3c2e2ed), [`550a41a`](https://github.com/Effect-TS/effect/commit/550a41a2547ce0dd5f085f1637a6f8a5794acba7), [`45d79c7`](https://github.com/Effect-TS/effect/commit/45d79c7cbd9c56c643361c6e6d1689f1aa62ae32), [`aac8584`](https://github.com/Effect-TS/effect/commit/aac8584fd997f3ce3341aeb077b816219832de58), [`7f87022`](https://github.com/Effect-TS/effect/commit/7f870225bb10a7ee7cb54b4835cb3bf64c0cacd8), [`425457c`](https://github.com/Effect-TS/effect/commit/425457c1e9eec7c176df130f7ec6ad3d616c086e), [`008c423`](https://github.com/Effect-TS/effect/commit/008c423e413fe311085c4bfc07c19b9c70529dfa), [`4f6ae04`](https://github.com/Effect-TS/effect/commit/4f6ae041a2886c27e941c5d9e4916aa2a32e0a1c), [`b6b63e1`](https://github.com/Effect-TS/effect/commit/b6b63e151595b5599ad2d65069ab6d298cfd7be7), [`92922ee`](https://github.com/Effect-TS/effect/commit/92922ee7de0a2d932121e37677f3e75ea38482f1), [`859c02f`](https://github.com/Effect-TS/effect/commit/859c02fe9020b0f28f713aa85910a0cc2d002560), [`ffc8235`](https://github.com/Effect-TS/effect/commit/ffc823537a0925171cf41d0841643a0b26895a4c), [`a29eb70`](https://github.com/Effect-TS/effect/commit/a29eb702ffe3fc58bd28c4d7857298cd65d73668), [`0be2303`](https://github.com/Effect-TS/effect/commit/0be2303dd39f9f2f7d8f96a28e25c938cd914e1a), [`b44636f`](https://github.com/Effect-TS/effect/commit/b44636ff7233763fad060bc0f9de10512454a29b), [`b19ccc7`](https://github.com/Effect-TS/effect/commit/b19ccc7325469a5dea091349bda4ae2ec00ec865), [`ff98f0b`](https://github.com/Effect-TS/effect/commit/ff98f0b0e2beb331209e37e42095d8d6e8e0b6c2), [`a47cbf1`](https://github.com/Effect-TS/effect/commit/a47cbf1feafd10e305c9753fa02a5f5f977d2c37), [`39b55f8`](https://github.com/Effect-TS/effect/commit/39b55f850aecbecf2e3b0c5f3ae2d1a77e6da949), [`c6c49c9`](https://github.com/Effect-TS/effect/commit/c6c49c96990d009341341a53ed26beb140c267a9), [`bf23ba7`](https://github.com/Effect-TS/effect/commit/bf23ba7033a4b426caf379bdcf84c58bb64d7010)]:
  - effect@4.0.0-rc.111

## 4.0.0-rc.110

### Patch Changes

- Updated dependencies [[`6eebd0a`](https://github.com/Effect-TS/effect/commit/6eebd0a618308a91f95947bae6e0fb206ae3939d), [`6eebd0a`](https://github.com/Effect-TS/effect/commit/6eebd0a618308a91f95947bae6e0fb206ae3939d), [`d10ceb0`](https://github.com/Effect-TS/effect/commit/d10ceb06d56108c11100868f591d2b42ddff5e9f), [`d10ceb0`](https://github.com/Effect-TS/effect/commit/d10ceb06d56108c11100868f591d2b42ddff5e9f), [`d10ceb0`](https://github.com/Effect-TS/effect/commit/d10ceb06d56108c11100868f591d2b42ddff5e9f), [`189b003`](https://github.com/Effect-TS/effect/commit/189b003a2367fa44dd4b8544aa62979f0345d179), [`189b003`](https://github.com/Effect-TS/effect/commit/189b003a2367fa44dd4b8544aa62979f0345d179), [`0a127b8`](https://github.com/Effect-TS/effect/commit/0a127b8847fb213d46621a5018c069019414c00d), [`e491deb`](https://github.com/Effect-TS/effect/commit/e491deb1cd1717bc442aaee96e5d7b4001710cc9), [`f99c508`](https://github.com/Effect-TS/effect/commit/f99c508a09e9fccddb09edd16fa3393891c55d48), [`7e3f07c`](https://github.com/Effect-TS/effect/commit/7e3f07cf3e4b6a907840aface36ae5ee67ca8979), [`a894fe1`](https://github.com/Effect-TS/effect/commit/a894fe1df8974077293d9c1b924a7f80fc7fe7f1), [`d10ceb0`](https://github.com/Effect-TS/effect/commit/d10ceb06d56108c11100868f591d2b42ddff5e9f), [`7e9923b`](https://github.com/Effect-TS/effect/commit/7e9923b1a0adf1f842216b298d7542bed980c9a5), [`f064121`](https://github.com/Effect-TS/effect/commit/f0641210f960563f813ac6f728804e5447c03341), [`d10ceb0`](https://github.com/Effect-TS/effect/commit/d10ceb06d56108c11100868f591d2b42ddff5e9f), [`b660bf0`](https://github.com/Effect-TS/effect/commit/b660bf01d9c427552296cd9e0195e21504f45e1f), [`f4fbe9c`](https://github.com/Effect-TS/effect/commit/f4fbe9ca0209cdfaaaff54fc3805221be80f1ffa), [`d10ceb0`](https://github.com/Effect-TS/effect/commit/d10ceb06d56108c11100868f591d2b42ddff5e9f), [`e811353`](https://github.com/Effect-TS/effect/commit/e811353e3b79ba392af1d9fb8d7f93fd729dabf9), [`9761c3c`](https://github.com/Effect-TS/effect/commit/9761c3c4787b3815346c1b650d8984efec8f1051), [`baa99fc`](https://github.com/Effect-TS/effect/commit/baa99fc176efed4986c19c78726d1dbe7bd17765), [`7fd79b2`](https://github.com/Effect-TS/effect/commit/7fd79b2cc95973f85b3db43b0cf3c5cb7d2f69c4), [`a82ffc0`](https://github.com/Effect-TS/effect/commit/a82ffc03df0fb34e02f16773b96bfa3e0208e427), [`d10ceb0`](https://github.com/Effect-TS/effect/commit/d10ceb06d56108c11100868f591d2b42ddff5e9f), [`4026e2d`](https://github.com/Effect-TS/effect/commit/4026e2dde3b098e70ffb3f1fcddd200176acdefd), [`397bf1e`](https://github.com/Effect-TS/effect/commit/397bf1ebd95c0d6d58dc53e4f33c8ad3f34746f6), [`d10ceb0`](https://github.com/Effect-TS/effect/commit/d10ceb06d56108c11100868f591d2b42ddff5e9f), [`d10ceb0`](https://github.com/Effect-TS/effect/commit/d10ceb06d56108c11100868f591d2b42ddff5e9f)]:
  - effect@4.0.0-rc.110

## 4.0.0-rc.109

### Patch Changes

- Updated dependencies [[`a0743f2`](https://github.com/Effect-TS/effect/commit/a0743f2b9f20fb5d150f35510e68819f01630bac), [`17892e7`](https://github.com/Effect-TS/effect/commit/17892e75a8d584f79127805506c42b19320990a7), [`4d8a230`](https://github.com/Effect-TS/effect/commit/4d8a2306dfff8fd5406ab75d0c8d22e5300d1faa), [`f21f9c9`](https://github.com/Effect-TS/effect/commit/f21f9c9f73dc59db922bda411b6d5245dae37cdb), [`18270dd`](https://github.com/Effect-TS/effect/commit/18270ddeaf4ad28723ca8a40aff04a5d4707b575), [`26db404`](https://github.com/Effect-TS/effect/commit/26db404a3284cfdbf4a3f351ccd05afc0de743b8), [`2670398`](https://github.com/Effect-TS/effect/commit/26703982612e12954360382e4b1d177002699d1c), [`3702bed`](https://github.com/Effect-TS/effect/commit/3702bedd8f6bcb3f603b87c640c521878d824eb3), [`ccae60e`](https://github.com/Effect-TS/effect/commit/ccae60e5edb2bef553f4af52afb509dfd443cd03), [`6ff5396`](https://github.com/Effect-TS/effect/commit/6ff53968138bbd7d4728ce8014e35eae8d6ca5d0)]:
  - effect@4.0.0-rc.109

## 4.0.0-rc.108

### Patch Changes

- Updated dependencies [[`dfb173e`](https://github.com/Effect-TS/effect/commit/dfb173efffd20c4feded4efe409018dd55acdca8), [`005e090`](https://github.com/Effect-TS/effect/commit/005e0902cace9f8960a4f43573665a3a9b53b6fa), [`c82c532`](https://github.com/Effect-TS/effect/commit/c82c53228dc1c50cc99654ce6de7766b4de09e75), [`22b579f`](https://github.com/Effect-TS/effect/commit/22b579f6c582e6e2d951784791fea6f1802517ed), [`3e19539`](https://github.com/Effect-TS/effect/commit/3e19539205082b1006d84553045d1b03db9cc8a1), [`08a3c74`](https://github.com/Effect-TS/effect/commit/08a3c74133206fc1cc728e0aa96d02e672fd80bd), [`eb0bae0`](https://github.com/Effect-TS/effect/commit/eb0bae08d543d58754c9bb7a57e67c1e2bb3f55a), [`97b544d`](https://github.com/Effect-TS/effect/commit/97b544d8b636587647b90691d669305c0eb4fc66), [`4f6d131`](https://github.com/Effect-TS/effect/commit/4f6d131e85d74ab0ec0300e52e503a5f943fc576), [`fad4b7c`](https://github.com/Effect-TS/effect/commit/fad4b7c5138b3f38c2427436da2e0685c1ca4e9b), [`accf447`](https://github.com/Effect-TS/effect/commit/accf4474513064e2a21d14b1937503261b4f34dc), [`31b27e4`](https://github.com/Effect-TS/effect/commit/31b27e49903c351588435f666c953aaac28f6120), [`8458951`](https://github.com/Effect-TS/effect/commit/84589518c3966c63d7f3679a5296d380eb1ba887)]:
  - effect@4.0.0-rc.108

## 4.0.0-beta.107

### Patch Changes

- Updated dependencies [[`596f3f9`](https://github.com/Effect-TS/effect/commit/596f3f92d7fe355811b815cb212332b082268ce8), [`9611ed4`](https://github.com/Effect-TS/effect/commit/9611ed42d11300546b339ab13492a0f7bdb1ebfb), [`8b91605`](https://github.com/Effect-TS/effect/commit/8b9160548556e4b0ec7ee2f2707716776be49018), [`d901928`](https://github.com/Effect-TS/effect/commit/d901928efa44f573ed1247f53fdb203a8e4fcede), [`b32bdef`](https://github.com/Effect-TS/effect/commit/b32bdef0d119a1ad1463dc01a46763ffee1f9bd9)]:
  - effect@4.0.0-beta.107

## 4.0.0-beta.106

### Patch Changes

- Updated dependencies [[`2695168`](https://github.com/Effect-TS/effect/commit/269516851b24916d72771f8a554b88722e3732e7), [`6310a8c`](https://github.com/Effect-TS/effect/commit/6310a8c68c74dcf1d23948ec9243ac5f407a1651), [`c2071b1`](https://github.com/Effect-TS/effect/commit/c2071b1647e2326568c1d0689274ef62b8a7183f), [`7aff81a`](https://github.com/Effect-TS/effect/commit/7aff81a9cefe681483ef8abf717d786fd10e7e8d), [`a1d4057`](https://github.com/Effect-TS/effect/commit/a1d4057711935a544ef441bc2d0ac3565dfa9266), [`abf77b0`](https://github.com/Effect-TS/effect/commit/abf77b04009dcb4d67a258f9d8ada778e9f4ffae), [`6c60375`](https://github.com/Effect-TS/effect/commit/6c60375e68683a32d54554150cc493e16550a06d), [`22f4897`](https://github.com/Effect-TS/effect/commit/22f4897bbae24783d4516f6bef353f1db4ec6d03), [`615d1d5`](https://github.com/Effect-TS/effect/commit/615d1d5d0256ec8160f2e08d0dcf5dc83acb7bf1), [`3a86757`](https://github.com/Effect-TS/effect/commit/3a867573ddeed5888dabdeb3225a9ebbf00491e7), [`f4a9762`](https://github.com/Effect-TS/effect/commit/f4a9762bb9dfad59c215f2e099dcc829d74f4ed1), [`0bcf6ed`](https://github.com/Effect-TS/effect/commit/0bcf6ed57c22e8a36964726b15464101d90f5997), [`ba9cb63`](https://github.com/Effect-TS/effect/commit/ba9cb63b87d45ce2df872dd8ef0905da147cc675), [`42c810d`](https://github.com/Effect-TS/effect/commit/42c810dd372275b822dd99c7d7e774e153f0a752), [`1416ccd`](https://github.com/Effect-TS/effect/commit/1416ccd474bc9da8979f51b72b5e53fb3ac56edf), [`08d0d39`](https://github.com/Effect-TS/effect/commit/08d0d39a225deccb9db213ab5fcf55edb9f9ba5d), [`548908a`](https://github.com/Effect-TS/effect/commit/548908a71d9337cb7defe7fc93b2fba8f6a04b6f), [`4b3460d`](https://github.com/Effect-TS/effect/commit/4b3460daa434ec465a95a50704fe1103a9275999), [`d170596`](https://github.com/Effect-TS/effect/commit/d17059615cca37ca2776654078fe0501ac5202e6), [`aea89d0`](https://github.com/Effect-TS/effect/commit/aea89d0c42ee0ac707a4962cd348fd3158cb469b), [`deed5fb`](https://github.com/Effect-TS/effect/commit/deed5fbdc91cf8bf8c5fce7dfa5d6527ac944726)]:
  - effect@4.0.0-beta.106

## 4.0.0-beta.105

### Patch Changes

- Updated dependencies [[`0418564`](https://github.com/Effect-TS/effect/commit/04185644dabb8e4169f1ef6cbbc0b36c4db2f7f4), [`d334a85`](https://github.com/Effect-TS/effect/commit/d334a8593aafcd60753995a9449b654c67bfdcc1), [`f0be855`](https://github.com/Effect-TS/effect/commit/f0be8554da6ee00293a6b23869ac46a0b0d97dc8), [`b206fa5`](https://github.com/Effect-TS/effect/commit/b206fa5d7655c1634c9993410a9203f6616a5ca2), [`b938c8a`](https://github.com/Effect-TS/effect/commit/b938c8ad2823bd88493187922f7d9090eff037b6), [`8525f05`](https://github.com/Effect-TS/effect/commit/8525f05d1e14ea12298e9e1a0df497bfaac2ce9a)]:
  - effect@4.0.0-beta.105

## 4.0.0-beta.104

### Patch Changes

- Updated dependencies [[`1001bcc`](https://github.com/Effect-TS/effect/commit/1001bccb9e874918d59dbb36860f1c5d4499ac20), [`993ba60`](https://github.com/Effect-TS/effect/commit/993ba60ee6c7ca6eb84522040f8b0d268b6ba7d4), [`67faacd`](https://github.com/Effect-TS/effect/commit/67faacd4679242559bee31717c05a5b10b990322), [`b78acdf`](https://github.com/Effect-TS/effect/commit/b78acdf422568f10ae8684fd3f10d52b065f0b56), [`fbb9ce5`](https://github.com/Effect-TS/effect/commit/fbb9ce5e625d1a7d6b7005bda42cbb6cd31476c5), [`722ea48`](https://github.com/Effect-TS/effect/commit/722ea484c9d01364c9242d929c0a564f7831a57c), [`3058fd5`](https://github.com/Effect-TS/effect/commit/3058fd594f5a683034212d71d957017fcc084006), [`62d0575`](https://github.com/Effect-TS/effect/commit/62d057566c241405c23ecf0bf4156186bd2be924), [`99dd6b5`](https://github.com/Effect-TS/effect/commit/99dd6b580434f97c5b40adc919f429e4abc3dfe7), [`7963ce1`](https://github.com/Effect-TS/effect/commit/7963ce1cd95f037fbefea67a29ead49cce4d16cb), [`af14e75`](https://github.com/Effect-TS/effect/commit/af14e752edd65e2b652e960411afafc88975a8d8), [`24e22d2`](https://github.com/Effect-TS/effect/commit/24e22d23a73a2e93ebf6d8edd2246a4a406942c8), [`647d14e`](https://github.com/Effect-TS/effect/commit/647d14e572c8004fa92fba256e00552b42bf34b7), [`1434eec`](https://github.com/Effect-TS/effect/commit/1434eecbd368e00839c24b3950f0b7a69218669a), [`a5278b1`](https://github.com/Effect-TS/effect/commit/a5278b18242011d1b2b08304c7c128151f9a4370), [`6af04a5`](https://github.com/Effect-TS/effect/commit/6af04a50bd019238f6acdb9cbda40439a3c09210), [`cb6c837`](https://github.com/Effect-TS/effect/commit/cb6c8376b2f322d4e7cbfc0973fc3b4f2951ee6e), [`d44cead`](https://github.com/Effect-TS/effect/commit/d44cead7e0e0ce61f0d980906e494f49a07e7899), [`88c7632`](https://github.com/Effect-TS/effect/commit/88c7632c2b59a49fcc40d250865bd8d0dccf31b0), [`abcbb2a`](https://github.com/Effect-TS/effect/commit/abcbb2abe16f1b6c587c15007df14371e1e70e93), [`8f63cce`](https://github.com/Effect-TS/effect/commit/8f63cce636700fde26b140b82e350ef916989d86), [`d56dfcf`](https://github.com/Effect-TS/effect/commit/d56dfcf54c2b9c53c3d098ce4b0ffcc84496c5f7), [`a98cda9`](https://github.com/Effect-TS/effect/commit/a98cda9422e1352f22e81696f759f326ffcfb667), [`6704bb8`](https://github.com/Effect-TS/effect/commit/6704bb84c320547f83cf50e8586ffc4c5e4c3cc5), [`6143de2`](https://github.com/Effect-TS/effect/commit/6143de21ee22038b45a8d4eba86f5aade6238eba), [`936b135`](https://github.com/Effect-TS/effect/commit/936b1358396eb0a1a7c8e0878ba63297e2106812), [`1bbae84`](https://github.com/Effect-TS/effect/commit/1bbae84f88b577a26d04ceb2e76d3143d09c4a20), [`d795ee7`](https://github.com/Effect-TS/effect/commit/d795ee771701ea62bd187ef7c0307d9737f68c1a), [`0a82d88`](https://github.com/Effect-TS/effect/commit/0a82d88b7da73278b6f270118e396d5ed4a64747), [`9215bc5`](https://github.com/Effect-TS/effect/commit/9215bc5da7dd10aa45f07fe44b98f06b6e433d62), [`a1b5df2`](https://github.com/Effect-TS/effect/commit/a1b5df2064d92431cfc6e638af613cc3114313d7), [`92a9ac5`](https://github.com/Effect-TS/effect/commit/92a9ac5ac0aa63d8975b9ba7a094d6a8f59a98f2), [`6bde7f2`](https://github.com/Effect-TS/effect/commit/6bde7f27f3243427203e53fe74472990e5c2a349), [`a712131`](https://github.com/Effect-TS/effect/commit/a7121310dbb60cbd819bbd702f97663098ec7bb8), [`2e6f760`](https://github.com/Effect-TS/effect/commit/2e6f760dcb44e2b984f3311a8af03a1d68a2ec7e), [`aa05804`](https://github.com/Effect-TS/effect/commit/aa0580497e027ed30b756058db0067c3fe07664f), [`badd3bf`](https://github.com/Effect-TS/effect/commit/badd3bf65fac4dd1e66e1f602db43659722dfced), [`02b0265`](https://github.com/Effect-TS/effect/commit/02b02651ede46a5a2dd3ef8081d0ad89648d0cbf), [`3437e21`](https://github.com/Effect-TS/effect/commit/3437e21a56d805781c5e5946a6189795a1dfd411), [`41a550d`](https://github.com/Effect-TS/effect/commit/41a550d1fed31e829929a8f5362b5340303164ac), [`17b5d50`](https://github.com/Effect-TS/effect/commit/17b5d50219ad49533cf9e33d01924a3e16af5eb3), [`96e5e95`](https://github.com/Effect-TS/effect/commit/96e5e9576b0315c747462761a61940ff9fe32dd1), [`e4d589e`](https://github.com/Effect-TS/effect/commit/e4d589e0ea08dc57c4793053b395dc0fcc499f34), [`ae4cf7b`](https://github.com/Effect-TS/effect/commit/ae4cf7b5e2cb5f8c55657e31a61789ad21c38c18), [`6ef5f1a`](https://github.com/Effect-TS/effect/commit/6ef5f1a041f3a40bf03fadd0b1feb275c277c635), [`2235a29`](https://github.com/Effect-TS/effect/commit/2235a29502c3f33cf6468511ad931089013a7916), [`b32f4cb`](https://github.com/Effect-TS/effect/commit/b32f4cb7b2d8ebe817075322622498e3beb05336), [`7f4c095`](https://github.com/Effect-TS/effect/commit/7f4c095b62da43780dd7fc2a5d1785ddfce60edf), [`5f3fb81`](https://github.com/Effect-TS/effect/commit/5f3fb814d18d8a54946c1c1cd0b41459cdb24006), [`17f0b91`](https://github.com/Effect-TS/effect/commit/17f0b91a243ccfe4a38d27debdc983adf434e738), [`0cdadd7`](https://github.com/Effect-TS/effect/commit/0cdadd75bc8abbbcad7956a4bc71f4e7a9b13250), [`39b57d7`](https://github.com/Effect-TS/effect/commit/39b57d7857358040558b67dd33eafc7bb5457830), [`5a6a573`](https://github.com/Effect-TS/effect/commit/5a6a5738e5bfc39e3a37ae7ba99081601fa19ac3), [`59f5e99`](https://github.com/Effect-TS/effect/commit/59f5e9981913b92d7a9beb2214a21d658b999d3a), [`45379d6`](https://github.com/Effect-TS/effect/commit/45379d6179ee4df2cbd3f848bd39ff7149c24a38), [`1949439`](https://github.com/Effect-TS/effect/commit/1949439175809ef81ab9c6411ed5559109edb4c9), [`e443403`](https://github.com/Effect-TS/effect/commit/e443403cf0e4effea14bb6cd950c5ac1c86cc748), [`03af7e8`](https://github.com/Effect-TS/effect/commit/03af7e85551204c605ea2fa2c43c10a4538ac8fb), [`0f721d4`](https://github.com/Effect-TS/effect/commit/0f721d406df8703ea92ca28777b3f09599e2056d), [`130b28d`](https://github.com/Effect-TS/effect/commit/130b28df552d7053407b041a96ff09dae82575e5), [`c987a12`](https://github.com/Effect-TS/effect/commit/c987a12a01b6a52ad53d29edf02613b03574dbcc), [`4158562`](https://github.com/Effect-TS/effect/commit/41585620977de9b84171f76619b72e29cc2284e5), [`306014a`](https://github.com/Effect-TS/effect/commit/306014a1ce4d5cb956c76bdc20e4e28ab3e61a6a), [`729a663`](https://github.com/Effect-TS/effect/commit/729a663275dd31f2357c446fe69664429220a83d), [`caf84b6`](https://github.com/Effect-TS/effect/commit/caf84b660044089e8d7f4067b279b27b8b50e8fd), [`ce067f7`](https://github.com/Effect-TS/effect/commit/ce067f799ea27735d4194345298a216aaf429f01), [`7a41f5a`](https://github.com/Effect-TS/effect/commit/7a41f5aa72d540ecf2746992ecc3fa3e6b40d31f), [`781022a`](https://github.com/Effect-TS/effect/commit/781022acdd3537ca18c88e2fa3681bafa6ef1b21), [`39f1297`](https://github.com/Effect-TS/effect/commit/39f1297acc08864feb12de6b8cf2bf73434f6cf5), [`2db266b`](https://github.com/Effect-TS/effect/commit/2db266b1bfbc81868bc1778c37c76032a267c79f), [`2141e28`](https://github.com/Effect-TS/effect/commit/2141e28903754d72604acf81673ceb2c62a56646), [`3c5e429`](https://github.com/Effect-TS/effect/commit/3c5e429878669ffcf5e0da4ddfbf50bde5bbcaad), [`20ddc63`](https://github.com/Effect-TS/effect/commit/20ddc630584f8fe488162ba384adcae53fc6810a), [`841b3ea`](https://github.com/Effect-TS/effect/commit/841b3ea6ae19a784bc1c20497b02f632af0c91e9), [`82a3fbf`](https://github.com/Effect-TS/effect/commit/82a3fbfce8b9df33e587076b7d7168ecd6799e17), [`eb9ee83`](https://github.com/Effect-TS/effect/commit/eb9ee83b38844a71d1cd5653a229309cfcb04a36), [`64dc7c7`](https://github.com/Effect-TS/effect/commit/64dc7c76dc5c89887b9e7c181d1873dcbb7820d1), [`84dc8ab`](https://github.com/Effect-TS/effect/commit/84dc8ab7accc682bc668c78a97e4a1776b633be8), [`b4463f4`](https://github.com/Effect-TS/effect/commit/b4463f46fc33d3b01ea5eadd7d012a5abda347a3), [`592dd36`](https://github.com/Effect-TS/effect/commit/592dd361645739ac0cd8e6babb084cd27403c172), [`85d2b44`](https://github.com/Effect-TS/effect/commit/85d2b446e3059de4919be730105868f79728308d), [`32e4a69`](https://github.com/Effect-TS/effect/commit/32e4a69b3151b7ec4058af2213b96a41d11e9e06), [`13c5872`](https://github.com/Effect-TS/effect/commit/13c5872ed30830360367ad89af2dab68a003c351), [`3454cdb`](https://github.com/Effect-TS/effect/commit/3454cdb528fdb5d3ed0c5c5c8169bc47de41fbd8), [`e930804`](https://github.com/Effect-TS/effect/commit/e9308045be1d8a00c0b4046f1e8ff22cf68c93da), [`7f12d4b`](https://github.com/Effect-TS/effect/commit/7f12d4b4e731dc3a213ae5c3f60db9edc50292d2), [`181c9ef`](https://github.com/Effect-TS/effect/commit/181c9ef5e5d4ab247bf4aec06424f15b0a1e802e), [`dd9f891`](https://github.com/Effect-TS/effect/commit/dd9f891e23f316abb6192893008f0e33ece9d97d), [`433fb81`](https://github.com/Effect-TS/effect/commit/433fb81ca4c15c681a8ae097ce3ff9bd3a9c9aa5), [`8459cdb`](https://github.com/Effect-TS/effect/commit/8459cdbae8a476dc04b6247fffe6a1668dcb1217), [`6124ab3`](https://github.com/Effect-TS/effect/commit/6124ab39eb64688fbd5d688d24766542f9cb5a2c), [`01bd954`](https://github.com/Effect-TS/effect/commit/01bd9546f142706fca1628f7261e6d1cb9638948), [`ba2c3aa`](https://github.com/Effect-TS/effect/commit/ba2c3aa05eb87ec05d263b960017ecf29746f66a), [`0a45ef3`](https://github.com/Effect-TS/effect/commit/0a45ef3bb4a1ae9b345c43c548db4336a31b3191), [`8459cdb`](https://github.com/Effect-TS/effect/commit/8459cdbae8a476dc04b6247fffe6a1668dcb1217), [`eaa7e71`](https://github.com/Effect-TS/effect/commit/eaa7e71b88bf59b24610128c6115a2a126432731), [`db4c2cc`](https://github.com/Effect-TS/effect/commit/db4c2ccdec77d813b6f4cc72a302ee7c4fe6e39d), [`22f150a`](https://github.com/Effect-TS/effect/commit/22f150a0936cef30517e87eaca73bff1c5e4873a), [`90ffb08`](https://github.com/Effect-TS/effect/commit/90ffb083b3091c211300f50a42ba7bf56536c0ee), [`d517692`](https://github.com/Effect-TS/effect/commit/d517692ef75f45d5f6d9d68b32d41fa0ccc56c99), [`01af079`](https://github.com/Effect-TS/effect/commit/01af079c189d1fc5067d3b1933b2870c4baf2693), [`32a59e8`](https://github.com/Effect-TS/effect/commit/32a59e8058b1ec9738cb083cf1cb116b393ca114)]:
  - effect@4.0.0-beta.104

## 4.0.0-beta.103

### Patch Changes

- [#6701](https://github.com/Effect-TS/effect/pull/6701) [`9867b9f`](https://github.com/Effect-TS/effect/commit/9867b9fc69f9cc6c443594fc7eccc7be0c674d9c) Thanks @fubhy! - Removed explicit ./index entrypoints

- [#6858](https://github.com/Effect-TS/effect/pull/6858) [`9fb59a5`](https://github.com/Effect-TS/effect/commit/9fb59a5bab412182320239c86068da23df5b2172) Thanks @fubhy! - Release transaction serialization when beginning a libSQL transaction fails, allowing later operations to retry.

- Updated dependencies [[`e56cd8f`](https://github.com/Effect-TS/effect/commit/e56cd8f90c3559baccf8fcf2852ea911235d5944), [`f77c120`](https://github.com/Effect-TS/effect/commit/f77c120d8e04779ddeb8bce8e9cde932f268e4b6), [`b2f95a9`](https://github.com/Effect-TS/effect/commit/b2f95a9c2f2581deb89dc3bae9e89cf819e82923), [`04fd44a`](https://github.com/Effect-TS/effect/commit/04fd44a42abfa8dc2642300dcf49ee48c8ef4539), [`b74333d`](https://github.com/Effect-TS/effect/commit/b74333d83e15b9d042e4698ad23040de60454afe), [`1c40b28`](https://github.com/Effect-TS/effect/commit/1c40b2809503d6aa1358777196fc66317906e657), [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046), [`b3901d2`](https://github.com/Effect-TS/effect/commit/b3901d29c543fd5bd05ceec669a17896c8e19006), [`4a0984a`](https://github.com/Effect-TS/effect/commit/4a0984af62738fedf4bd3e87adb4d4d641ce9147), [`fffd88b`](https://github.com/Effect-TS/effect/commit/fffd88b3135abdf928ca7c4b0e00e610985091c7), [`f3f6c1e`](https://github.com/Effect-TS/effect/commit/f3f6c1e02cb543423fcffef5dc2db03fac503588), [`ef07642`](https://github.com/Effect-TS/effect/commit/ef07642dfe671d5258b65d1c1480c4d05c495f15), [`f1bc827`](https://github.com/Effect-TS/effect/commit/f1bc8274a608813d7b09d28dcca04adbf62f8c92), [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046), [`081f4d8`](https://github.com/Effect-TS/effect/commit/081f4d8cd06a2ac222d2810b46e61efcee26939e), [`5287b24`](https://github.com/Effect-TS/effect/commit/5287b24f5f8fa094ba20e117bfb1a80fba6d2cf5), [`13d31cf`](https://github.com/Effect-TS/effect/commit/13d31cfc2dde46210e94391b5b6767ae9aeaf2c9), [`acee269`](https://github.com/Effect-TS/effect/commit/acee26944bc89ee554d7b9fadab7443f9edc28a9), [`31170c1`](https://github.com/Effect-TS/effect/commit/31170c19b236c37abb5476c821bc6f5bfa2735ab), [`205ebc7`](https://github.com/Effect-TS/effect/commit/205ebc776062012581e98fced7ced19adfc44ee7), [`ed0ebf8`](https://github.com/Effect-TS/effect/commit/ed0ebf8e5c864d46fed1f232e99c0e680f10a58f), [`a3fd084`](https://github.com/Effect-TS/effect/commit/a3fd08482157bd78b089f77c7b173d54ef68b5cd), [`ee29ddf`](https://github.com/Effect-TS/effect/commit/ee29ddf862c3723ad466abc93ab6f6fe723b2319), [`6086309`](https://github.com/Effect-TS/effect/commit/60863090af8e5af0bfa1435f08dc5390f9993e30), [`4a57af2`](https://github.com/Effect-TS/effect/commit/4a57af24011db1d66e947289d2f7ffc2074696d2), [`660875b`](https://github.com/Effect-TS/effect/commit/660875b4325e6eebb3f04513998301cd2a0847ec), [`8e7c706`](https://github.com/Effect-TS/effect/commit/8e7c706b0aca855489b53d987404566d3e9cb5e7), [`5f63adb`](https://github.com/Effect-TS/effect/commit/5f63adbe75fc9d50d23706a52b3e483ad2a1a01c), [`053bc42`](https://github.com/Effect-TS/effect/commit/053bc42e2a964755611a216e78ed214322efee37), [`c0a1534`](https://github.com/Effect-TS/effect/commit/c0a153494484ecf9f0d0f20895a7a648b4be363b), [`f1e3a37`](https://github.com/Effect-TS/effect/commit/f1e3a378c144f974a6122b299f421b75595af20f), [`cedb01a`](https://github.com/Effect-TS/effect/commit/cedb01a025492a1faf9e59eb23eb96bc3b5e2fff), [`1747440`](https://github.com/Effect-TS/effect/commit/1747440de9a51a56ed3660da748cc01b256adce7), [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046), [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046), [`b4f1ee2`](https://github.com/Effect-TS/effect/commit/b4f1ee238d96aa78c5f040158cb78671d75b381e), [`a4757f1`](https://github.com/Effect-TS/effect/commit/a4757f1c47067d8d016a6c4a2c541bb8ae520f9b), [`cd122b9`](https://github.com/Effect-TS/effect/commit/cd122b90300d995a237993a2edb7a049785ab6a4), [`5de588b`](https://github.com/Effect-TS/effect/commit/5de588b2472fb0f4eb919766eb8472583a044772), [`3895b9c`](https://github.com/Effect-TS/effect/commit/3895b9cf179262cd277a9c6daafe9050dcf8265e), [`89ce5f3`](https://github.com/Effect-TS/effect/commit/89ce5f3e16e23a193daa475dc72ea8133ae1dacd), [`985de09`](https://github.com/Effect-TS/effect/commit/985de097d75906db2aed784841f81e23cc978b43), [`9800e3a`](https://github.com/Effect-TS/effect/commit/9800e3acc8f36530f671bc8b91558cb112f449a7), [`4dc35f6`](https://github.com/Effect-TS/effect/commit/4dc35f64641746366f867ea3dbfedb9cd4685ada), [`e8eb62b`](https://github.com/Effect-TS/effect/commit/e8eb62b3d0ef27e9761cdc2eb93bdec52d6ee204), [`ecd9993`](https://github.com/Effect-TS/effect/commit/ecd99936112cb69efdb02de3a2fd57f47baefdf3), [`5ab9c08`](https://github.com/Effect-TS/effect/commit/5ab9c08463ce049c45f3502676954a7b72c6b024), [`f5cf965`](https://github.com/Effect-TS/effect/commit/f5cf96548afd51f4b3cf1aea11b04d7f8549ce90), [`a94cbed`](https://github.com/Effect-TS/effect/commit/a94cbed84e9e49bea4bff925599c0f19c4e3deab), [`9160ad7`](https://github.com/Effect-TS/effect/commit/9160ad7d146d4376dd12f7510c025e5b2f638a70), [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046), [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046), [`52494be`](https://github.com/Effect-TS/effect/commit/52494be9e8eb3bb542d06a3dfefc6bca4e168984), [`5441c8e`](https://github.com/Effect-TS/effect/commit/5441c8e656a6418c0d27feb2df67565a3e1155f4), [`c9b56ab`](https://github.com/Effect-TS/effect/commit/c9b56ab507f224426ee8388dc450da447ec4715f), [`8ef7257`](https://github.com/Effect-TS/effect/commit/8ef72577d1f43212cab87951d659e54e3c8d7d91), [`1519406`](https://github.com/Effect-TS/effect/commit/1519406fed6e8b017ae178dc20bcaa2cf318b570), [`9716990`](https://github.com/Effect-TS/effect/commit/97169902eec3c99baa7f0b2c7b45a0a5eae75819), [`733f75b`](https://github.com/Effect-TS/effect/commit/733f75b7125e3016a975fdd251c0179ae5393786), [`48155c8`](https://github.com/Effect-TS/effect/commit/48155c8ccfc12dcca8a00fa358d50b20c30874e4), [`951d06b`](https://github.com/Effect-TS/effect/commit/951d06b83d459d3e8fa9024e727a5db1662d3322), [`d767b65`](https://github.com/Effect-TS/effect/commit/d767b65a7687e38be23f0b0ee3d52ab5f2360cbe), [`5d52d9d`](https://github.com/Effect-TS/effect/commit/5d52d9d148aaa7f736ed8c310fc8bfa9dc81badf), [`f4151e1`](https://github.com/Effect-TS/effect/commit/f4151e1937c26de14f1d64566f8126173f1b5014), [`e02fbb6`](https://github.com/Effect-TS/effect/commit/e02fbb66f5a0f13dba6c33ef63528a37a17a0676), [`724ce09`](https://github.com/Effect-TS/effect/commit/724ce09650a458d4565e5c7331ea92ca04f08e68), [`dbe91f6`](https://github.com/Effect-TS/effect/commit/dbe91f6961ef9f7e8da910ee5758d9c0d385fca8), [`4c008d2`](https://github.com/Effect-TS/effect/commit/4c008d28b370d817f7ae4579db09836fe084c8d2), [`b650832`](https://github.com/Effect-TS/effect/commit/b6508328708a842f3163467b72486bd228f1a289), [`b46c92f`](https://github.com/Effect-TS/effect/commit/b46c92f3b314f4ffd612b831efa55dd856c587a3), [`5335797`](https://github.com/Effect-TS/effect/commit/5335797003076d9c6fd170da98d779696d555596), [`4b3460d`](https://github.com/Effect-TS/effect/commit/4b3460daa434ec465a95a50704fe1103a9275999), [`6301fd7`](https://github.com/Effect-TS/effect/commit/6301fd710b4325718de2c42997dac28a9e9aa250), [`aebc5c6`](https://github.com/Effect-TS/effect/commit/aebc5c61664b89a840465ec65b79ce635a5ceee8), [`52b2d7b`](https://github.com/Effect-TS/effect/commit/52b2d7b5bd3c7cce3bd5b69c6ab3941004da70f3), [`eec5744`](https://github.com/Effect-TS/effect/commit/eec57445dfa0ef3c5977195ad69415b7e7d42bb6), [`24e0e93`](https://github.com/Effect-TS/effect/commit/24e0e93dc307dc2c2ae86caacb7289e1dab3c103), [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046), [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046), [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046), [`1a7ce81`](https://github.com/Effect-TS/effect/commit/1a7ce8150e3977586c44d8ccb9a8384389bb4d49), [`48f22a7`](https://github.com/Effect-TS/effect/commit/48f22a7d16ae57ee2175d450dafbdeb69e187d2a), [`c96b7f6`](https://github.com/Effect-TS/effect/commit/c96b7f6359662053c3e09344f61dddc7a6caf4ac), [`6d2a942`](https://github.com/Effect-TS/effect/commit/6d2a942ed7cd33b8fd79d549edba33bc9e2a7e3e), [`cc27b19`](https://github.com/Effect-TS/effect/commit/cc27b194b9d13fa3a66ab037e853fca9d41700ff), [`8f9499f`](https://github.com/Effect-TS/effect/commit/8f9499f562729f5f7b08d8bcc4db86b4aeff8a21), [`3eeea73`](https://github.com/Effect-TS/effect/commit/3eeea73cfc3e9b126975c2ddbdb7f7c8c92026e2), [`0a532e5`](https://github.com/Effect-TS/effect/commit/0a532e503f165fdea485a5343fc2f420917e8376), [`f398149`](https://github.com/Effect-TS/effect/commit/f398149c134fd9b67b6cdc52eae3f3248d5c7bbe), [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046), [`ace903e`](https://github.com/Effect-TS/effect/commit/ace903e09c2549ceebdec380797beb027cd29f3d), [`e8eb62b`](https://github.com/Effect-TS/effect/commit/e8eb62b3d0ef27e9761cdc2eb93bdec52d6ee204), [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046), [`48f22a7`](https://github.com/Effect-TS/effect/commit/48f22a7d16ae57ee2175d450dafbdeb69e187d2a), [`d48506d`](https://github.com/Effect-TS/effect/commit/d48506d97525040aa714305e928126df799795b4), [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046), [`d48506d`](https://github.com/Effect-TS/effect/commit/d48506d97525040aa714305e928126df799795b4), [`d48506d`](https://github.com/Effect-TS/effect/commit/d48506d97525040aa714305e928126df799795b4), [`52262be`](https://github.com/Effect-TS/effect/commit/52262be2edce0e350c6ac10f8f725678606399c5), [`1284aa1`](https://github.com/Effect-TS/effect/commit/1284aa183451955ad7921bbe01fd0e095695d444), [`9867b9f`](https://github.com/Effect-TS/effect/commit/9867b9fc69f9cc6c443594fc7eccc7be0c674d9c), [`d0f1a22`](https://github.com/Effect-TS/effect/commit/d0f1a2295155c350b04efb46852cb40032805273), [`979ce39`](https://github.com/Effect-TS/effect/commit/979ce3985d7d62ce2bf240681ca19feda3027452), [`b6d3e67`](https://github.com/Effect-TS/effect/commit/b6d3e67c7cc143cd8470cdf704324e79d23954a9), [`adf6c6c`](https://github.com/Effect-TS/effect/commit/adf6c6cd388af8a3c0c546492e71555368556f6a), [`7314d60`](https://github.com/Effect-TS/effect/commit/7314d605284717aaafe7fc34b88c3c93397e865c), [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046), [`1acbd8b`](https://github.com/Effect-TS/effect/commit/1acbd8b44c68ebb23735e9810476b870dbe58aea), [`7bde6cc`](https://github.com/Effect-TS/effect/commit/7bde6ccb2b144fe953ff30a7ef5e1ecc97697146), [`a959a8b`](https://github.com/Effect-TS/effect/commit/a959a8bf21cdb976369f494dc949fa00a050d3e0)]:
  - effect@4.0.0-beta.103

## 4.0.0-beta.102

### Patch Changes

- Updated dependencies [[`b6392e1`](https://github.com/Effect-TS/effect/commit/b6392e119704553edec1b4fd2869ac0dbec621ef), [`7ed9450`](https://github.com/Effect-TS/effect/commit/7ed945044eb56aa9aeaf62d4746a011c96c58628), [`45762bd`](https://github.com/Effect-TS/effect/commit/45762bd78df9ecd87c98b8d3738cdeeac7d81128), [`a6e8391`](https://github.com/Effect-TS/effect/commit/a6e8391cd31acd898fae18b3f8e7ca4c6f14f065), [`4ac7e8b`](https://github.com/Effect-TS/effect/commit/4ac7e8b136c61a26c3e438c013dfd7349b38e999), [`4cd40f5`](https://github.com/Effect-TS/effect/commit/4cd40f5692477783bef84fed3c5ef1c0cf5602e6), [`6956bc0`](https://github.com/Effect-TS/effect/commit/6956bc0e6cb27f53fbec39d9b18545940f9f598f), [`0e50ec7`](https://github.com/Effect-TS/effect/commit/0e50ec7dbb94390666f292cf9120719bf30a7246), [`9fcdade`](https://github.com/Effect-TS/effect/commit/9fcdade4a8af772b9ccd8b8a24fe8cee0e5d8470), [`57367d5`](https://github.com/Effect-TS/effect/commit/57367d54de55047ff0c5fce9685475e236bf354c), [`35c445f`](https://github.com/Effect-TS/effect/commit/35c445ff18029d192900ea0914c993f58d5cf1a5), [`c917bb9`](https://github.com/Effect-TS/effect/commit/c917bb94a4c1c4e0a24372a8ebb8a5ca232e36b5), [`bc1f358`](https://github.com/Effect-TS/effect/commit/bc1f3583e63344cb2c398d9040d9c975488ed123), [`0e0c9d7`](https://github.com/Effect-TS/effect/commit/0e0c9d7922ff463c1093d9e0576fae12cb0698d5), [`73d40aa`](https://github.com/Effect-TS/effect/commit/73d40aacd8fcae1b48c23f5b0a5c542127401d1d), [`4f1e318`](https://github.com/Effect-TS/effect/commit/4f1e3183f7123591c46224e9c587df7594562a5f), [`9d8d85c`](https://github.com/Effect-TS/effect/commit/9d8d85c1bb7da51970845b8ea830e386e777514a), [`6079fda`](https://github.com/Effect-TS/effect/commit/6079fda7b02f2f01ad91c15ab8c307336f3ba252), [`5101e92`](https://github.com/Effect-TS/effect/commit/5101e92c9c149c153423f43dd7a94f6194653c06), [`d0b3265`](https://github.com/Effect-TS/effect/commit/d0b3265c3262670761471ab3518cf933b1b3b20a), [`7a03c89`](https://github.com/Effect-TS/effect/commit/7a03c893ce6492bf94c0ebfb00b63bf25dcbf83e), [`cea1d9c`](https://github.com/Effect-TS/effect/commit/cea1d9c92601e69ebda040af8a1d860d604d885c), [`078e1f5`](https://github.com/Effect-TS/effect/commit/078e1f5636e31b76a86722a636afc37a8cc25580), [`97bafea`](https://github.com/Effect-TS/effect/commit/97bafeab460833b9781527b437d1cb9cbee63260), [`fab0ab8`](https://github.com/Effect-TS/effect/commit/fab0ab8f7ab15ae596faa4ccf75615a494d11b0b), [`c323d8b`](https://github.com/Effect-TS/effect/commit/c323d8b30dbbe85f9df25b67288b93d5332de333), [`6966353`](https://github.com/Effect-TS/effect/commit/69663534d626003eb10a5e55ab1f13e0379fead1), [`0444004`](https://github.com/Effect-TS/effect/commit/04440041989c1785fe4db286379f2be2c15baa85), [`028bbb3`](https://github.com/Effect-TS/effect/commit/028bbb391e161185da10d974ab33381f769940d7), [`ff5d6e2`](https://github.com/Effect-TS/effect/commit/ff5d6e278a1fdff714315dc1a17075012f05c1f0), [`1bfce93`](https://github.com/Effect-TS/effect/commit/1bfce93e6d2bf0794c11733daf51c2390e7de375), [`7ce815c`](https://github.com/Effect-TS/effect/commit/7ce815cd5af6af991dfc13b890fd22345fc77c20), [`7271a7f`](https://github.com/Effect-TS/effect/commit/7271a7faf1080aa75f2f53ca6a0b5ec9334c1d38), [`475fe5c`](https://github.com/Effect-TS/effect/commit/475fe5c12c2d6504c475797c0634f90da01e1797)]:
  - effect@4.0.0-beta.102

## 4.0.0-beta.101

### Patch Changes

- Updated dependencies [[`731bea1`](https://github.com/Effect-TS/effect/commit/731bea19416755a904ff5e809413e5922785d0a4), [`731bea1`](https://github.com/Effect-TS/effect/commit/731bea19416755a904ff5e809413e5922785d0a4), [`731bea1`](https://github.com/Effect-TS/effect/commit/731bea19416755a904ff5e809413e5922785d0a4), [`731bea1`](https://github.com/Effect-TS/effect/commit/731bea19416755a904ff5e809413e5922785d0a4), [`731bea1`](https://github.com/Effect-TS/effect/commit/731bea19416755a904ff5e809413e5922785d0a4), [`b35ed29`](https://github.com/Effect-TS/effect/commit/b35ed2904f01536d303b21f288daf343cf740462), [`dd44624`](https://github.com/Effect-TS/effect/commit/dd446245736a0e88c807a02f03c21450bb9340fa), [`731bea1`](https://github.com/Effect-TS/effect/commit/731bea19416755a904ff5e809413e5922785d0a4), [`2bae1ac`](https://github.com/Effect-TS/effect/commit/2bae1accce9d3b72cf6d5aefc9b2161af6d88436)]:
  - effect@4.0.0-beta.101

## 4.0.0-beta.100

### Patch Changes

- Updated dependencies [[`c1288dd`](https://github.com/Effect-TS/effect/commit/c1288dd1a52a2811ab7df57fc4ce236c6be4c745), [`2b58a3d`](https://github.com/Effect-TS/effect/commit/2b58a3dab6bc99776dddaf76e27d811e0f47f3d8), [`6dc83f2`](https://github.com/Effect-TS/effect/commit/6dc83f26ddf20d48db28cf761dd8f3716e5273fb), [`c1e2fe0`](https://github.com/Effect-TS/effect/commit/c1e2fe0cf93564f4d919e3998874c3e70b0cf30f), [`f3fbae8`](https://github.com/Effect-TS/effect/commit/f3fbae8d7bae0d77cb4f35a1598b26c58e3bf94d), [`e000f80`](https://github.com/Effect-TS/effect/commit/e000f80fd55bcd8edc699fdbf4cd109004f4f754), [`f4ee765`](https://github.com/Effect-TS/effect/commit/f4ee7655ee052cf9ba726fd602bb87c89c7c62a9), [`510b55f`](https://github.com/Effect-TS/effect/commit/510b55f3e21750685dbfd5f476a130c1c5af9dbd), [`31d3fc4`](https://github.com/Effect-TS/effect/commit/31d3fc4327c50867bb8d881fa7353aeb03ea2826), [`875e618`](https://github.com/Effect-TS/effect/commit/875e618c3764a7b817ac863d0af86924449528f2), [`688d46a`](https://github.com/Effect-TS/effect/commit/688d46afd0ef923d983ad3d7385f52f217b28d70), [`6ff5023`](https://github.com/Effect-TS/effect/commit/6ff502363b9840a5a5ee0a24bc6cae734ac3a3eb), [`c0333e7`](https://github.com/Effect-TS/effect/commit/c0333e7f755f42ddcca7051e029da8b4eed527bf), [`06e7e8c`](https://github.com/Effect-TS/effect/commit/06e7e8c66015ee318f871b9d2218dee82df2b108), [`eb9b102`](https://github.com/Effect-TS/effect/commit/eb9b10256c8558881b441c2fef833b7037174400), [`8b155da`](https://github.com/Effect-TS/effect/commit/8b155da06e0740c354ec562957a45ab65eb4573b), [`3a87335`](https://github.com/Effect-TS/effect/commit/3a8733564c5db35271aa20564ed0d344daa2a79f)]:
  - effect@4.0.0-beta.100

## 4.0.0-beta.99

### Patch Changes

- Updated dependencies [[`8ce4795`](https://github.com/Effect-TS/effect/commit/8ce4795ccbaebca4292757db568c005a992546a4), [`80b539f`](https://github.com/Effect-TS/effect/commit/80b539f8aba68f478c75c35c2b4140c4ffc4fada), [`88a54cc`](https://github.com/Effect-TS/effect/commit/88a54cc341006e3ebcb13482c618f62a680ce199), [`e6e6dba`](https://github.com/Effect-TS/effect/commit/e6e6dba6e9d86e7c2ad27dcedf289db76a19697f), [`bfb203e`](https://github.com/Effect-TS/effect/commit/bfb203e95aa439f731acad37fc3a9a831a190f1c), [`2e9a34a`](https://github.com/Effect-TS/effect/commit/2e9a34ac2bece4f3a206160480c991e3841dc67a), [`55d4eb3`](https://github.com/Effect-TS/effect/commit/55d4eb34f2c64d54f6a25a305b5c5438ebd7934e), [`bddb010`](https://github.com/Effect-TS/effect/commit/bddb010eac3d4436cb094edbbee7460c5440c162), [`a328835`](https://github.com/Effect-TS/effect/commit/a328835e50d76bc96648a1c1550456e8c9f81210), [`5560d05`](https://github.com/Effect-TS/effect/commit/5560d05aa6abdd29466d9c3412cc5e648b0adbde), [`8f6e3ad`](https://github.com/Effect-TS/effect/commit/8f6e3adb185b16e8820b98c509b308086f7ff1af), [`46997fa`](https://github.com/Effect-TS/effect/commit/46997fa60401f5e3c93daa4b61f7df8e31caaab4), [`9e6e12d`](https://github.com/Effect-TS/effect/commit/9e6e12d75c118cd265496f2880490d1f33a5c8bf), [`3394b93`](https://github.com/Effect-TS/effect/commit/3394b93d97d6f24fc38670641d1490289ffca7f1), [`febeabc`](https://github.com/Effect-TS/effect/commit/febeabc3f7c31094da000a23edeaabfe2ab00a38), [`54161c9`](https://github.com/Effect-TS/effect/commit/54161c98f6f3569e0c31842f54e6a257f9421c4c), [`385f7a4`](https://github.com/Effect-TS/effect/commit/385f7a4ee4a7359928597ea56d151dbaf5eb5802), [`7eea4d0`](https://github.com/Effect-TS/effect/commit/7eea4d0b73ec554915d7066a71f46326ce2ba45f), [`7543afe`](https://github.com/Effect-TS/effect/commit/7543afea6f4d97d1f1ad876224323838a48daadd), [`44b9cf3`](https://github.com/Effect-TS/effect/commit/44b9cf3d240d726997b4bbcd0ede48e074d3c456), [`7eea4d0`](https://github.com/Effect-TS/effect/commit/7eea4d0b73ec554915d7066a71f46326ce2ba45f), [`0a8aa6a`](https://github.com/Effect-TS/effect/commit/0a8aa6acb90a72b91c24d17133c950e4cacd8abd), [`c8d9fcf`](https://github.com/Effect-TS/effect/commit/c8d9fcf7b030f7c474effbab2764ce7aee1c7209), [`9ca7f9a`](https://github.com/Effect-TS/effect/commit/9ca7f9a69363e4485645966d5a93b8f9597c5206), [`e7aca89`](https://github.com/Effect-TS/effect/commit/e7aca894bb32fbb785b5830837e6061c415a6015), [`55d7560`](https://github.com/Effect-TS/effect/commit/55d75609b8acf8a1b54c1b1c7fbbb65ec741aa3e), [`f809189`](https://github.com/Effect-TS/effect/commit/f809189ddf6b6011ba43a9901baaa734e315da2a), [`88a54cc`](https://github.com/Effect-TS/effect/commit/88a54cc341006e3ebcb13482c618f62a680ce199), [`0ebdbe7`](https://github.com/Effect-TS/effect/commit/0ebdbe74463dc84385956d0b1e8c2b79ebab5400), [`7517d09`](https://github.com/Effect-TS/effect/commit/7517d09f12a0b183a81bd425962c4e280a68b05d), [`212493b`](https://github.com/Effect-TS/effect/commit/212493b9a1eb98cd1ef6959c707a2e5784a5ae91), [`88a54cc`](https://github.com/Effect-TS/effect/commit/88a54cc341006e3ebcb13482c618f62a680ce199), [`80ea8cb`](https://github.com/Effect-TS/effect/commit/80ea8cb9222ca73f564c8267ab2f82966fea027a), [`8df19f4`](https://github.com/Effect-TS/effect/commit/8df19f4fe81d90cc33ace88b9a77e5534f82d604)]:
  - effect@4.0.0-beta.99

## 4.0.0-beta.98

### Patch Changes

- Updated dependencies [[`989603b`](https://github.com/Effect-TS/effect-smol/commit/989603b60ab1197b64acf214208e0d370cd1f842), [`214c458`](https://github.com/Effect-TS/effect-smol/commit/214c458084bb6995d543cd37d1055f24be3d454e), [`a037273`](https://github.com/Effect-TS/effect-smol/commit/a0372736ac34796969b051bbba4717d7983f1ebe), [`97fdaa9`](https://github.com/Effect-TS/effect-smol/commit/97fdaa9c1f522c65e579365d314a07878e2b904f), [`b24d248`](https://github.com/Effect-TS/effect-smol/commit/b24d248c8df44222ce642087cde2bd859a2dc709), [`19c222c`](https://github.com/Effect-TS/effect-smol/commit/19c222cac2353a3d7b7733caecb00556fffe9a5c), [`eec85dd`](https://github.com/Effect-TS/effect-smol/commit/eec85ddba09ea326fd268ee33eeffd47e50d4671), [`0082f4f`](https://github.com/Effect-TS/effect-smol/commit/0082f4f74fb139fd578f87f0a790e845133983dc), [`8849052`](https://github.com/Effect-TS/effect-smol/commit/884905232d1e9a365e046d8dde27bf9c5707f57f), [`c15e16a`](https://github.com/Effect-TS/effect-smol/commit/c15e16ad130d1fbde25d912b7ac55995066cb35b), [`01d00a3`](https://github.com/Effect-TS/effect-smol/commit/01d00a3abfbf1f37996cdbe738ea5137c646cdd7), [`8bd4589`](https://github.com/Effect-TS/effect-smol/commit/8bd458975a1b3a8ed042eccf317b93d28ded91e7), [`0082f4f`](https://github.com/Effect-TS/effect-smol/commit/0082f4f74fb139fd578f87f0a790e845133983dc), [`6e08428`](https://github.com/Effect-TS/effect-smol/commit/6e08428d980501b856f846ad3f3f0e4ea46e7786), [`388dcf9`](https://github.com/Effect-TS/effect-smol/commit/388dcf953f65d317547f34d40e6443c5f264205f), [`2b7ce2b`](https://github.com/Effect-TS/effect-smol/commit/2b7ce2b513e7ec2a77822f1116dc6ffb6ba93f4e), [`87bea7e`](https://github.com/Effect-TS/effect-smol/commit/87bea7e16259246f3bcdf565446394751abca953), [`ce38dc3`](https://github.com/Effect-TS/effect-smol/commit/ce38dc33bda805a684432cca071f4dc3c6b9a1ba), [`a807cd1`](https://github.com/Effect-TS/effect-smol/commit/a807cd170341deca8a1cfb52c4222585f2431bb9), [`fd8a356`](https://github.com/Effect-TS/effect-smol/commit/fd8a356f06a8c9ce4e7e0a13fc4021c178ed31de), [`c2a5edc`](https://github.com/Effect-TS/effect-smol/commit/c2a5edc3abd31ad5bc123362bc1213e03e4095c3), [`5946da3`](https://github.com/Effect-TS/effect-smol/commit/5946da3804a1be5e752b05b96bd058cdba50a1bf), [`4ae0c5f`](https://github.com/Effect-TS/effect-smol/commit/4ae0c5ffcbe6c56ddfcb05c639112a079483539e), [`5b2a0bc`](https://github.com/Effect-TS/effect-smol/commit/5b2a0bceea3a28a33a58555210c90a415dc74a76), [`72ac585`](https://github.com/Effect-TS/effect-smol/commit/72ac585884befde6af9208da738699a93f1bae79), [`5e8c1b8`](https://github.com/Effect-TS/effect-smol/commit/5e8c1b82bfafa121311f987a49ab75395e3647a7), [`0f9c078`](https://github.com/Effect-TS/effect-smol/commit/0f9c07841b04183f485ee6e6458de73b290b09f5)]:
  - effect@4.0.0-beta.98

## 4.0.0-beta.97

### Patch Changes

- Updated dependencies []:
  - effect@4.0.0-beta.97

## 4.0.0-beta.96

### Patch Changes

- Updated dependencies [[`1503f45`](https://github.com/Effect-TS/effect-smol/commit/1503f45cb5bb2a74f4705252ec505a1f0ade7e62), [`57fe793`](https://github.com/Effect-TS/effect-smol/commit/57fe79316ffbc380b30626a168981fb26ae97459), [`0c2f78f`](https://github.com/Effect-TS/effect-smol/commit/0c2f78f695ec474e1ff5474da183577975e418f5), [`0c2f78f`](https://github.com/Effect-TS/effect-smol/commit/0c2f78f695ec474e1ff5474da183577975e418f5), [`0c2f78f`](https://github.com/Effect-TS/effect-smol/commit/0c2f78f695ec474e1ff5474da183577975e418f5), [`97f29df`](https://github.com/Effect-TS/effect-smol/commit/97f29df457f7ffd07cfb4b379315c12c086af805)]:
  - effect@4.0.0-beta.96

## 4.0.0-beta.95

### Patch Changes

- Updated dependencies [[`a482442`](https://github.com/Effect-TS/effect-smol/commit/a482442abdeb490e9652b854ec3495e4aa7273e7), [`fbefa85`](https://github.com/Effect-TS/effect-smol/commit/fbefa850fab2f0a302c20614496aeaaa2a8b5590), [`0b4a32f`](https://github.com/Effect-TS/effect-smol/commit/0b4a32f4260f0d8500942a133001b0d349328102), [`18a49e1`](https://github.com/Effect-TS/effect-smol/commit/18a49e1786679456258002ff9397faf02f678c2d), [`266cb90`](https://github.com/Effect-TS/effect-smol/commit/266cb90bb2c17aabc40563c32db334f09ba3d74b), [`912f095`](https://github.com/Effect-TS/effect-smol/commit/912f095a34572bbd3cedf6edb27878443e3e4a95), [`a6718f9`](https://github.com/Effect-TS/effect-smol/commit/a6718f9e00a15ca903b0732da46116cbf3d6aca7), [`bef5154`](https://github.com/Effect-TS/effect-smol/commit/bef51540a243aa2f872a00c01d0cd58b7a769baa), [`18e0564`](https://github.com/Effect-TS/effect-smol/commit/18e0564bd0f8ebbdfcaf1e2c21529948e9e4a81d), [`fb50f14`](https://github.com/Effect-TS/effect-smol/commit/fb50f14fc3657c1973785aa5b72ecf0b0d28e0b2)]:
  - effect@4.0.0-beta.95

## 4.0.0-beta.94

### Patch Changes

- Updated dependencies [[`95a0e9b`](https://github.com/Effect-TS/effect-smol/commit/95a0e9bb62797af0e81c9998773405f248f218c5), [`a0a3490`](https://github.com/Effect-TS/effect-smol/commit/a0a3490bbce765f199d8e077aceac504f0462e63), [`f11ce73`](https://github.com/Effect-TS/effect-smol/commit/f11ce73af60823754dc24194f4ffc561b9ea1c2d), [`ff30b6e`](https://github.com/Effect-TS/effect-smol/commit/ff30b6e7c2c63ffc56a4c5818d6d86b01b5ad528), [`1caab3c`](https://github.com/Effect-TS/effect-smol/commit/1caab3cc30f626efbf15e59d74f539a487e5c85c), [`aa80c47`](https://github.com/Effect-TS/effect-smol/commit/aa80c4775a04db87553e5568764cab7e32a72814), [`c2ae4fc`](https://github.com/Effect-TS/effect-smol/commit/c2ae4fce2f03a4cd1861c2b1179da7df656e662d), [`a0a3490`](https://github.com/Effect-TS/effect-smol/commit/a0a3490bbce765f199d8e077aceac504f0462e63)]:
  - effect@4.0.0-beta.94

## 4.0.0-beta.93

### Patch Changes

- Updated dependencies [[`00652fe`](https://github.com/Effect-TS/effect-smol/commit/00652fe95c18f87208e91343eb8bf218faa2f677), [`6c58167`](https://github.com/Effect-TS/effect-smol/commit/6c5816746eaf91d2a3c7c899c5720809fa230ae3), [`2bc5415`](https://github.com/Effect-TS/effect-smol/commit/2bc541501a7ef89e542d7cb98e96beb53cd205cc), [`e11cccc`](https://github.com/Effect-TS/effect-smol/commit/e11cccc7d5fe631abccc7d6e3bd296938de0fa2e), [`ba7e77e`](https://github.com/Effect-TS/effect-smol/commit/ba7e77e046b8641a3a4e9750bb88ca4a1d063d3f), [`5713ee7`](https://github.com/Effect-TS/effect-smol/commit/5713ee7edbc3054efde407b2286bbfd45bbc6e1c)]:
  - effect@4.0.0-beta.93

## 4.0.0-beta.92

### Patch Changes

- Updated dependencies [[`affdc13`](https://github.com/Effect-TS/effect-smol/commit/affdc139045cc325dce321a84a580fdc1b2da7b9)]:
  - effect@4.0.0-beta.92

## 4.0.0-beta.91

### Patch Changes

- Updated dependencies [[`b135b25`](https://github.com/Effect-TS/effect-smol/commit/b135b2517fca9e7839734ace3699a7dfa75b9075), [`aaa21a3`](https://github.com/Effect-TS/effect-smol/commit/aaa21a369a171c600db294f2a4f640583043e150), [`3475ee6`](https://github.com/Effect-TS/effect-smol/commit/3475ee6c2bda6b05c6d7a12ce30c8bb840b5b1a6)]:
  - effect@4.0.0-beta.91

## 4.0.0-beta.90

### Patch Changes

- Updated dependencies [[`d237fdf`](https://github.com/Effect-TS/effect-smol/commit/d237fdf726481f76eb52a6196e111b24122bc3d5)]:
  - effect@4.0.0-beta.90

## 4.0.0-beta.89

### Patch Changes

- Updated dependencies [[`b7d46ab`](https://github.com/Effect-TS/effect-smol/commit/b7d46ab7e1a29d8711817bab583c9febf48a0dad), [`7777e15`](https://github.com/Effect-TS/effect-smol/commit/7777e1540fd3680dd8346723cffec812b9384669), [`5376197`](https://github.com/Effect-TS/effect-smol/commit/5376197ca8e50358a41b1fd3cec27bd1ec680ec6)]:
  - effect@4.0.0-beta.89

## 4.0.0-beta.88

### Patch Changes

- Updated dependencies [[`911f1b8`](https://github.com/Effect-TS/effect-smol/commit/911f1b84790ce42b3a70c95b33e6f6fd9e74de8b), [`8beeeea`](https://github.com/Effect-TS/effect-smol/commit/8beeeea52879d8613a39468848f01c3092bd54d4), [`c306fcf`](https://github.com/Effect-TS/effect-smol/commit/c306fcfeb1ef38455156932a1faf49292b1318da)]:
  - effect@4.0.0-beta.88

## 4.0.0-beta.87

### Patch Changes

- Updated dependencies [[`5a0c1a4`](https://github.com/Effect-TS/effect-smol/commit/5a0c1a4faee5707b5cc35e646ff1ffdad70f1956), [`1eea2ea`](https://github.com/Effect-TS/effect-smol/commit/1eea2ea3795ba47316b82b1ac8d4612c0ba389ed)]:
  - effect@4.0.0-beta.87

## 4.0.0-beta.86

### Patch Changes

- [#2462](https://github.com/Effect-TS/effect-smol/pull/2462) [`0b5795a`](https://github.com/Effect-TS/effect-smol/commit/0b5795a0ab4395e8f15955d8d96f2303084bfc64) Thanks @tim-smart! - Add `Statement.valuesUnprepared` for returning unprepared SQL statement rows as arrays.

- Updated dependencies [[`0b5795a`](https://github.com/Effect-TS/effect-smol/commit/0b5795a0ab4395e8f15955d8d96f2303084bfc64), [`3e3a859`](https://github.com/Effect-TS/effect-smol/commit/3e3a859ec6351a9e0d31674aabbd48fcefabb12e), [`7dbec24`](https://github.com/Effect-TS/effect-smol/commit/7dbec240dbf3bca599a20c486632abce694ef5ab), [`d8c00a1`](https://github.com/Effect-TS/effect-smol/commit/d8c00a171ac7141e8adc08c332d1162d9a9d56fc), [`85b6317`](https://github.com/Effect-TS/effect-smol/commit/85b631701e935866f2762bd595237aa718370cd9), [`6d0fda0`](https://github.com/Effect-TS/effect-smol/commit/6d0fda0d0cbdfffc523c89c57dfdb1608f84fb12), [`108a933`](https://github.com/Effect-TS/effect-smol/commit/108a9335ff8571928197e5847a09c28ac83d6f46), [`7e1f455`](https://github.com/Effect-TS/effect-smol/commit/7e1f455fab5005d769b939c91e519d450f802cf9), [`46b3e79`](https://github.com/Effect-TS/effect-smol/commit/46b3e79944cfdae7901eb148135c85b7eb39834e)]:
  - effect@4.0.0-beta.86

## 4.0.0-beta.85

### Patch Changes

- Updated dependencies [[`328d97c`](https://github.com/Effect-TS/effect-smol/commit/328d97cc53c0dcb89077a5623e35b095eaa59a8c), [`8441836`](https://github.com/Effect-TS/effect-smol/commit/8441836e6dde70e8ae2126be9cefe9b45798b134), [`074e436`](https://github.com/Effect-TS/effect-smol/commit/074e4361091289104cb0ab6959dc3b0ea7794a6a), [`c1dfd60`](https://github.com/Effect-TS/effect-smol/commit/c1dfd60663eb13a58916f3712d877499943b628a), [`2ba316b`](https://github.com/Effect-TS/effect-smol/commit/2ba316bd15fcbf1c50626500d44a2c9b3bec19f5), [`7ce7344`](https://github.com/Effect-TS/effect-smol/commit/7ce7344c41056c79e2ee19ee6a9346c0f1d227c1)]:
  - effect@4.0.0-beta.85

## 4.0.0-beta.84

### Patch Changes

- Updated dependencies [[`87f52ba`](https://github.com/Effect-TS/effect-smol/commit/87f52ba16c4370ffa3f84bf8e53038e1419c284e), [`b8ee07f`](https://github.com/Effect-TS/effect-smol/commit/b8ee07ffda8903b5ec2e45a786ddcba59f128fda), [`867c0d7`](https://github.com/Effect-TS/effect-smol/commit/867c0d70a09079b040260d45a1e92ff04dbfbf2f), [`b93bc6c`](https://github.com/Effect-TS/effect-smol/commit/b93bc6c9cb27b909a41d094c97c4f9d25bbc6d6b), [`57d387f`](https://github.com/Effect-TS/effect-smol/commit/57d387f92c30ab63e15e3e641f0a903b65886610), [`bacca41`](https://github.com/Effect-TS/effect-smol/commit/bacca4141c2400effae1eabfdb36c89a459cf246), [`0f8ac79`](https://github.com/Effect-TS/effect-smol/commit/0f8ac7959d29ed68c68ce25aabd6bf0cb7e63ecc), [`25b4482`](https://github.com/Effect-TS/effect-smol/commit/25b448270c01317703f25107e1480d4cd0246d9a), [`9cf3a25`](https://github.com/Effect-TS/effect-smol/commit/9cf3a25c66b0c44a52be9829870c44517ea52db2), [`8def767`](https://github.com/Effect-TS/effect-smol/commit/8def7674b1787f91035298cda4d122937e87ef72)]:
  - effect@4.0.0-beta.84

## 4.0.0-beta.83

### Patch Changes

- Updated dependencies [[`1f2e8ce`](https://github.com/Effect-TS/effect-smol/commit/1f2e8ceef09e0a791c850ed2ade01f97089596f9)]:
  - effect@4.0.0-beta.83

## 4.0.0-beta.82

### Patch Changes

- Updated dependencies [[`193690b`](https://github.com/Effect-TS/effect-smol/commit/193690b642ea802bbed40d663bd677251bbe9dc3)]:
  - effect@4.0.0-beta.82

## 4.0.0-beta.81

### Patch Changes

- Updated dependencies [[`93cb4f8`](https://github.com/Effect-TS/effect-smol/commit/93cb4f8fbfb9e07cb9dc86ce6b155fd1f8167914), [`60341d9`](https://github.com/Effect-TS/effect-smol/commit/60341d9ca744d0473ce3fab621ca9bd225af3a39), [`1105ab5`](https://github.com/Effect-TS/effect-smol/commit/1105ab56cb724212f7ea7b431396ce82e8fd0484), [`4500fbf`](https://github.com/Effect-TS/effect-smol/commit/4500fbfe00763d8a72af6e5d6c5988e8bd4ade36)]:
  - effect@4.0.0-beta.81

## 4.0.0-beta.80

### Patch Changes

- Updated dependencies [[`d944330`](https://github.com/Effect-TS/effect-smol/commit/d94433090ee03f426d43e13b883abae4494e55e6), [`f48659f`](https://github.com/Effect-TS/effect-smol/commit/f48659fdcc84930ebc1e5b45b540c0f973389182), [`7652aaa`](https://github.com/Effect-TS/effect-smol/commit/7652aaa3bdbc39f241fe58b54b9a43b713e22e12), [`98630b7`](https://github.com/Effect-TS/effect-smol/commit/98630b7c8f679c352ba6796636c85688fa009d8d), [`90ae23c`](https://github.com/Effect-TS/effect-smol/commit/90ae23cf07284da5e1bcd9dffa882e85df7e617b)]:
  - effect@4.0.0-beta.80

## 4.0.0-beta.79

### Patch Changes

- Updated dependencies [[`b9704dc`](https://github.com/Effect-TS/effect-smol/commit/b9704dc9de9f1649ad502371014fe869b69a49a3), [`a207113`](https://github.com/Effect-TS/effect-smol/commit/a207113f66837bb54416926718a9a7d66774d079), [`5e9b9e2`](https://github.com/Effect-TS/effect-smol/commit/5e9b9e217b164ebfd4a002dd4380b3b1563200c3), [`7c128ae`](https://github.com/Effect-TS/effect-smol/commit/7c128aef458a1e2d224712e51c483c9badad1d44), [`0ada457`](https://github.com/Effect-TS/effect-smol/commit/0ada457c0513d8d908254ab77ebb7d29d2b523d6), [`d7cc5a2`](https://github.com/Effect-TS/effect-smol/commit/d7cc5a2bede3de10943aa0c6bdb4f26836a91efd), [`aad63be`](https://github.com/Effect-TS/effect-smol/commit/aad63becf65e0a6b076e94f8973be7bbe7fbd46f), [`09809f6`](https://github.com/Effect-TS/effect-smol/commit/09809f60f19ec98232f98b33e33e02ecb7e4fbd6), [`2fddda5`](https://github.com/Effect-TS/effect-smol/commit/2fddda5311929f46b61e503f0ade4fc749e8c77d), [`5f21768`](https://github.com/Effect-TS/effect-smol/commit/5f2176833399757c4500d8875b7f2fba0393de75), [`f27003e`](https://github.com/Effect-TS/effect-smol/commit/f27003e00524ff83f20dd9909f62b2f8795efe03)]:
  - effect@4.0.0-beta.79

## 4.0.0-beta.78

### Patch Changes

- Updated dependencies [[`7836b8e`](https://github.com/Effect-TS/effect-smol/commit/7836b8eb8bb0f3e04cdf554ee070caccf74f00c1), [`35d49a3`](https://github.com/Effect-TS/effect-smol/commit/35d49a3a09bdba6b513de87ddcead9e61a1042ba), [`4093258`](https://github.com/Effect-TS/effect-smol/commit/40932580e65bafab5f23c5f14b520cb411d0b2cd)]:
  - effect@4.0.0-beta.78

## 4.0.0-beta.77

### Patch Changes

- Updated dependencies [[`6e9a5ca`](https://github.com/Effect-TS/effect-smol/commit/6e9a5ca62a61156fd67b2518ad3ab14ac0d25f23), [`302f398`](https://github.com/Effect-TS/effect-smol/commit/302f3984ce206e35d86ddd99d3b72be144850a51)]:
  - effect@4.0.0-beta.77

## 4.0.0-beta.76

### Patch Changes

- Updated dependencies [[`016108a`](https://github.com/Effect-TS/effect-smol/commit/016108a472af7048ddbbfd05f233e67529fafe12), [`95c03d2`](https://github.com/Effect-TS/effect-smol/commit/95c03d2c55930668c215b5a41c23cf7742fead84), [`07299a3`](https://github.com/Effect-TS/effect-smol/commit/07299a33c09fd52faa9810d30835a2622c752386)]:
  - effect@4.0.0-beta.76

## 4.0.0-beta.75

### Patch Changes

- Updated dependencies [[`81b187c`](https://github.com/Effect-TS/effect-smol/commit/81b187c17a0d8817b58232826939154010ae49d7), [`ad4b535`](https://github.com/Effect-TS/effect-smol/commit/ad4b535e17f94ce35261829d5a3675f0a7808b4e), [`a29c2e7`](https://github.com/Effect-TS/effect-smol/commit/a29c2e7e3570920156702671d6f3367cd0195f6c), [`1fdd9ae`](https://github.com/Effect-TS/effect-smol/commit/1fdd9aeed92b6bb70987c862e7f6f66ead0339b3), [`1fdd9ae`](https://github.com/Effect-TS/effect-smol/commit/1fdd9aeed92b6bb70987c862e7f6f66ead0339b3), [`ffea4ec`](https://github.com/Effect-TS/effect-smol/commit/ffea4ecf2925f6a4c9fd13079d47584cbf2bed00), [`4255c9b`](https://github.com/Effect-TS/effect-smol/commit/4255c9ba78bb98c7838fbe9dccdd8465e9da5427)]:
  - effect@4.0.0-beta.75

## 4.0.0-beta.74

### Patch Changes

- Updated dependencies [[`b1fc6a4`](https://github.com/Effect-TS/effect-smol/commit/b1fc6a4b4d0ca7fa9fd162799ae17c86f2f7ee8e)]:
  - effect@4.0.0-beta.74

## 4.0.0-beta.73

### Patch Changes

- Updated dependencies [[`361ca30`](https://github.com/Effect-TS/effect-smol/commit/361ca30eb6e134feece547d6e00f82be4cb23f75), [`b9598c6`](https://github.com/Effect-TS/effect-smol/commit/b9598c6a209e75bfdb87ee3b024ecd1e3923ff6e)]:
  - effect@4.0.0-beta.73

## 4.0.0-beta.72

### Patch Changes

- Updated dependencies [[`73e67d1`](https://github.com/Effect-TS/effect-smol/commit/73e67d119a84d697773eaecb4865c6a71eb1a9cb), [`01d71ec`](https://github.com/Effect-TS/effect-smol/commit/01d71ec5a75f3c2747a8d3b1ad9701d1e27b7ce5), [`fcd707e`](https://github.com/Effect-TS/effect-smol/commit/fcd707e091a16e1b35343c901cc4052274e32239)]:
  - effect@4.0.0-beta.72

## 4.0.0-beta.71

### Patch Changes

- Updated dependencies [[`d8ac76b`](https://github.com/Effect-TS/effect-smol/commit/d8ac76b5bad458c42cebe8a0c1b3843f955ac293), [`2c3c00a`](https://github.com/Effect-TS/effect-smol/commit/2c3c00af6faba7b7d422af26a7a2bbc35636d230), [`3751e7c`](https://github.com/Effect-TS/effect-smol/commit/3751e7cf353e7a54cd692c37401207d9afba1e63), [`fc5f25b`](https://github.com/Effect-TS/effect-smol/commit/fc5f25b03ada5fc2431987768a74d3d3e75ca485), [`7ccced4`](https://github.com/Effect-TS/effect-smol/commit/7ccced42867c14c013b01160b3d292f14c05bd04), [`a2e1fe5`](https://github.com/Effect-TS/effect-smol/commit/a2e1fe5835c98c8ee4393a091b1d11b75126e349), [`4a4a36b`](https://github.com/Effect-TS/effect-smol/commit/4a4a36b10e6e616cad07584a43908f6a7e07e618), [`d350292`](https://github.com/Effect-TS/effect-smol/commit/d3502922b4740fa9d745797cbc3775cb67839b6d), [`730afb6`](https://github.com/Effect-TS/effect-smol/commit/730afb66696adf9bd5a328cbca29df9c05968771), [`df1b008`](https://github.com/Effect-TS/effect-smol/commit/df1b008f370f414c2a67a7b8139ef747af8e5fba), [`6d469d5`](https://github.com/Effect-TS/effect-smol/commit/6d469d567a7c41d7e5343bdee21d45b07b0e8190)]:
  - effect@4.0.0-beta.71

## 4.0.0-beta.70

### Patch Changes

- Updated dependencies [[`af7782d`](https://github.com/Effect-TS/effect-smol/commit/af7782d3008d08b043f3a3f261516001514b2b4e), [`7212d70`](https://github.com/Effect-TS/effect-smol/commit/7212d701a3eee7b3553ff502e2c066126e52e839)]:
  - effect@4.0.0-beta.70

## 4.0.0-beta.69

### Patch Changes

- Updated dependencies [[`70ea04a`](https://github.com/Effect-TS/effect-smol/commit/70ea04aa96a2a7859d738d414e1f0e3ed081a27a), [`d0ea8b0`](https://github.com/Effect-TS/effect-smol/commit/d0ea8b03f7d73ae076c1db12666141e480d11178), [`a57674b`](https://github.com/Effect-TS/effect-smol/commit/a57674b64845e9e75a456cf907bfdcb858859118), [`59aa334`](https://github.com/Effect-TS/effect-smol/commit/59aa334fbd0a504dda3c36f6d2ef1be7449b4b8b), [`8f4208e`](https://github.com/Effect-TS/effect-smol/commit/8f4208ee83bc7bdaa6793b5429847b45aab72470)]:
  - effect@4.0.0-beta.69

## 4.0.0-beta.68

### Patch Changes

- Updated dependencies [[`af8267f`](https://github.com/Effect-TS/effect-smol/commit/af8267f2f3588c3fb611e9286f6f933f29ce1217), [`0176eaf`](https://github.com/Effect-TS/effect-smol/commit/0176eaf3ecd7c1b99a10268f2af02d7e8ce161e5), [`0176eaf`](https://github.com/Effect-TS/effect-smol/commit/0176eaf3ecd7c1b99a10268f2af02d7e8ce161e5), [`f136bb7`](https://github.com/Effect-TS/effect-smol/commit/f136bb763048cbc6b17edd26496dba3e2415b9fa), [`6f38f07`](https://github.com/Effect-TS/effect-smol/commit/6f38f07d5941a211b251383aaab0f4f55e8a6557), [`aec9c40`](https://github.com/Effect-TS/effect-smol/commit/aec9c401a53db227f18bf5e0c84db7130ad862d6)]:
  - effect@4.0.0-beta.68

## 4.0.0-beta.67

### Patch Changes

- Updated dependencies [[`a42ef66`](https://github.com/Effect-TS/effect-smol/commit/a42ef6632abbddfa820995ae310ccc84ae8d9b6f), [`35594f8`](https://github.com/Effect-TS/effect-smol/commit/35594f811cafe471acd490114b103a1f8392c8d8), [`8bddd62`](https://github.com/Effect-TS/effect-smol/commit/8bddd628cb623f9533d345082583ff51cead6836), [`4be4c8d`](https://github.com/Effect-TS/effect-smol/commit/4be4c8d60862aa963869ee2ed9ffa048ffac0527), [`0c9d3ab`](https://github.com/Effect-TS/effect-smol/commit/0c9d3ab43eb721a370ed8306260cbac218c27e87), [`b156acc`](https://github.com/Effect-TS/effect-smol/commit/b156accd2691b4a051f823affdece7c39923ce85), [`d16c034`](https://github.com/Effect-TS/effect-smol/commit/d16c03434ee3e6dcd3bfc82b65d99e881d89025b), [`b559d68`](https://github.com/Effect-TS/effect-smol/commit/b559d68845f848a10153395778f035682d399075), [`a3de5d9`](https://github.com/Effect-TS/effect-smol/commit/a3de5d9215e5cc4a62e2666efbd7c1bf595eb84f), [`7e6c12e`](https://github.com/Effect-TS/effect-smol/commit/7e6c12ec9b3a5945f6c26e272cc8f6390541ad3e), [`098167a`](https://github.com/Effect-TS/effect-smol/commit/098167a220fe07da6f14455818733ab1b269c9dd)]:
  - effect@4.0.0-beta.67

## 4.0.0-beta.66

### Patch Changes

- Updated dependencies [[`ca2498e`](https://github.com/Effect-TS/effect-smol/commit/ca2498e702ac2d83fb7187707b7eb069bdb261a2), [`cd7d1fb`](https://github.com/Effect-TS/effect-smol/commit/cd7d1fba7e2e2c5ac3ad64e1be433440a5bda436), [`19a7033`](https://github.com/Effect-TS/effect-smol/commit/19a703367ec817cffc41d152da9b594827408e2b), [`33d26b4`](https://github.com/Effect-TS/effect-smol/commit/33d26b4210b2e974f146a71e7eed962f8ce00900), [`856766b`](https://github.com/Effect-TS/effect-smol/commit/856766b2c506aaed6d2df1d63bf3a5b1b062e1d4), [`079c7df`](https://github.com/Effect-TS/effect-smol/commit/079c7df82559bb9ce10a86dffb85d25e6ce07dc3)]:
  - effect@4.0.0-beta.66

## 4.0.0-beta.65

### Patch Changes

- [#2148](https://github.com/Effect-TS/effect-smol/pull/2148) [`6f11454`](https://github.com/Effect-TS/effect-smol/commit/6f11454a9b6c3bd00f6b35fd7af14a2f2d63a0a2) Thanks @tim-smart! - Add `UniqueViolation` as a new SQL error reason. Supported unique constraint violations now classify as `UniqueViolation` instead of the broader `ConstraintError` reason.

  This covers PostgreSQL, PGlite, MySQL, MSSQL, and the shared SQLite classification used by the SQLite-family clients. `UniqueViolation.constraint` contains the best available constraint, index, or key identifier and falls back to exactly `"unknown"` when no reliable identifier is available.

- Updated dependencies [[`6f11454`](https://github.com/Effect-TS/effect-smol/commit/6f11454a9b6c3bd00f6b35fd7af14a2f2d63a0a2)]:
  - effect@4.0.0-beta.65

## 4.0.0-beta.64

### Patch Changes

- Updated dependencies [[`7d4877a`](https://github.com/Effect-TS/effect-smol/commit/7d4877a1929cdb690280ea254326c04f2ec97ea5)]:
  - effect@4.0.0-beta.64

## 4.0.0-beta.63

### Patch Changes

- Updated dependencies [[`7f927ff`](https://github.com/Effect-TS/effect-smol/commit/7f927ffb7a9801dcfc4096c29e369d13d65cd0ac), [`a696b3e`](https://github.com/Effect-TS/effect-smol/commit/a696b3e83a8504cdbe261a18c10a1cc0619ae102)]:
  - effect@4.0.0-beta.63

## 4.0.0-beta.62

### Patch Changes

- Updated dependencies [[`4ab4b90`](https://github.com/Effect-TS/effect-smol/commit/4ab4b9007dc27a52ffabc6fcb37c96eeec795bf7)]:
  - effect@4.0.0-beta.62

## 4.0.0-beta.61

### Patch Changes

- Updated dependencies [[`50790af`](https://github.com/Effect-TS/effect-smol/commit/50790af9b190c38d10fb0723837d49b66432638f), [`71f7c3d`](https://github.com/Effect-TS/effect-smol/commit/71f7c3df997deda92c84146d569696dab3bd645c), [`aae8797`](https://github.com/Effect-TS/effect-smol/commit/aae8797b9cb383be0c182dd58d03d787c354238b)]:
  - effect@4.0.0-beta.61

## 4.0.0-beta.60

### Patch Changes

- Updated dependencies [[`f69d567`](https://github.com/Effect-TS/effect-smol/commit/f69d5675dcff9f4137295752baf066b7153fdc09), [`7909c95`](https://github.com/Effect-TS/effect-smol/commit/7909c954b8f6244a35a4b429f8dd0dff45dad620), [`bbb4dcc`](https://github.com/Effect-TS/effect-smol/commit/bbb4dcc6c406b83a416b4ad3541cc02037c420e4), [`7af2207`](https://github.com/Effect-TS/effect-smol/commit/7af2207901eabf3132c1b7010a69b3899c06fbbe), [`848b40a`](https://github.com/Effect-TS/effect-smol/commit/848b40a4bd4bf54a5098617d50c33c88eee8270a)]:
  - effect@4.0.0-beta.60

## 4.0.0-beta.59

### Patch Changes

- Updated dependencies [[`56837ea`](https://github.com/Effect-TS/effect-smol/commit/56837ea2a338395b35550641374e9e589bd8b71d)]:
  - effect@4.0.0-beta.59

## 4.0.0-beta.58

### Patch Changes

- Updated dependencies [[`11993d4`](https://github.com/Effect-TS/effect-smol/commit/11993d4934c66f5dc611b8bbf553f01d501ef8f7), [`96c8b22`](https://github.com/Effect-TS/effect-smol/commit/96c8b22c2057ccddbf10ed269d7697f22119b3ec), [`96c8b22`](https://github.com/Effect-TS/effect-smol/commit/96c8b22c2057ccddbf10ed269d7697f22119b3ec)]:
  - effect@4.0.0-beta.58

## 4.0.0-beta.57

### Patch Changes

- Updated dependencies [[`a971f5c`](https://github.com/Effect-TS/effect-smol/commit/a971f5cbd92dfe4274420bf0966595eb35531060), [`8e110c5`](https://github.com/Effect-TS/effect-smol/commit/8e110c5f02a429ccc43a91df8678e402138c0851)]:
  - effect@4.0.0-beta.57

## 4.0.0-beta.56

### Patch Changes

- Updated dependencies []:
  - effect@4.0.0-beta.56

## 4.0.0-beta.55

### Patch Changes

- Updated dependencies [[`42cc744`](https://github.com/Effect-TS/effect-smol/commit/42cc744570968deb365fb46d47b53d3277050c93), [`04855ce`](https://github.com/Effect-TS/effect-smol/commit/04855ceeca4d40c55a5750dd9893b691f8ea741a)]:
  - effect@4.0.0-beta.55

## 4.0.0-beta.54

### Patch Changes

- Updated dependencies [[`e4b74f9`](https://github.com/Effect-TS/effect-smol/commit/e4b74f9c01a0e9b6cd58416de4af3a26d51da7c8), [`4c72808`](https://github.com/Effect-TS/effect-smol/commit/4c728081851c66dacf889a816535671bc841ae96)]:
  - effect@4.0.0-beta.54

## 4.0.0-beta.53

### Patch Changes

- Updated dependencies [[`0768509`](https://github.com/Effect-TS/effect-smol/commit/07685094e931af07d104165195826a535b55fa7e), [`476aede`](https://github.com/Effect-TS/effect-smol/commit/476aede69c6efa06b5781ca5eb3e3b128ca29141), [`4f79c54`](https://github.com/Effect-TS/effect-smol/commit/4f79c542e7b508c235ff485d862cc8b29a8260c5), [`4be6a7c`](https://github.com/Effect-TS/effect-smol/commit/4be6a7cf35dab2a01d652f56dd35f0358c5a7e88), [`88927eb`](https://github.com/Effect-TS/effect-smol/commit/88927ebb896162cdba103b36553280b58e0facac)]:
  - effect@4.0.0-beta.53

## 4.0.0-beta.52

### Patch Changes

- Updated dependencies [[`8e04bfc`](https://github.com/Effect-TS/effect-smol/commit/8e04bfc95554b74eac205d67a20388e056b21499), [`cf3a311`](https://github.com/Effect-TS/effect-smol/commit/cf3a311d863a8abb818840c3b80f847e621c43c1), [`8e04bfc`](https://github.com/Effect-TS/effect-smol/commit/8e04bfc95554b74eac205d67a20388e056b21499), [`131fdd5`](https://github.com/Effect-TS/effect-smol/commit/131fdd5b1f26531e265fe1a08f002002f47c276e)]:
  - effect@4.0.0-beta.52

## 4.0.0-beta.51

### Patch Changes

- Updated dependencies [[`778d2af`](https://github.com/Effect-TS/effect-smol/commit/778d2afe9b5154bc1f9abae46d93ea7e54c87344), [`4e24dcf`](https://github.com/Effect-TS/effect-smol/commit/4e24dcf75037f65eebc1eb68623bc7cbf9d5512a), [`4b1c015`](https://github.com/Effect-TS/effect-smol/commit/4b1c0150e9bdb5559ed32d250deb66e17b4240c7), [`454f8ad`](https://github.com/Effect-TS/effect-smol/commit/454f8adad822929c3ef60f8280d0987226b049fd), [`6754a0c`](https://github.com/Effect-TS/effect-smol/commit/6754a0cd18626b06805a079cc5265525a5eb7d27), [`90f7fd5`](https://github.com/Effect-TS/effect-smol/commit/90f7fd5243871b30980964135db4512b8119fa82), [`d7e1519`](https://github.com/Effect-TS/effect-smol/commit/d7e151974934201fd93fa4c8a1192ee9a5d965a0), [`72a8122`](https://github.com/Effect-TS/effect-smol/commit/72a81228e09782bae512f7d041bbfbc78bc668d0)]:
  - effect@4.0.0-beta.51

## 4.0.0-beta.50

### Patch Changes

- Updated dependencies [[`07be594`](https://github.com/Effect-TS/effect-smol/commit/07be594825de60f8e1b2102d21dbb9b8fc63b414), [`ae02433`](https://github.com/Effect-TS/effect-smol/commit/ae02433103ce28f53a0c9bfb4a44e75773289b7b)]:
  - effect@4.0.0-beta.50

## 4.0.0-beta.49

### Patch Changes

- Updated dependencies [[`7d87873`](https://github.com/Effect-TS/effect-smol/commit/7d8787340ff549370f6f2a88b612e9ebbfd6ba45), [`c2f6f90`](https://github.com/Effect-TS/effect-smol/commit/c2f6f901b200a6e515b4f02c93ce8005b7bbf1c5), [`216f13c`](https://github.com/Effect-TS/effect-smol/commit/216f13c1fce454a21b489bb915714a17e791a1ac)]:
  - effect@4.0.0-beta.49

## 4.0.0-beta.48

### Patch Changes

- Updated dependencies [[`4da56ec`](https://github.com/Effect-TS/effect-smol/commit/4da56ecff129b2da40137ffede23a73cc4e532d8), [`a5e6f77`](https://github.com/Effect-TS/effect-smol/commit/a5e6f774bab195cf50ecdc818240765f69a3bf4a), [`f1ba5b8`](https://github.com/Effect-TS/effect-smol/commit/f1ba5b8584d325a541156928cecf041b37fd5070), [`f1ba5b8`](https://github.com/Effect-TS/effect-smol/commit/f1ba5b8584d325a541156928cecf041b37fd5070)]:
  - effect@4.0.0-beta.48

## 4.0.0-beta.47

### Patch Changes

- Updated dependencies [[`c584726`](https://github.com/Effect-TS/effect-smol/commit/c58472674e750e6938df955044eab88feda95e45), [`86a91a4`](https://github.com/Effect-TS/effect-smol/commit/86a91a4f0c59286dfa9393232d8020dea70ed4db), [`131caf9`](https://github.com/Effect-TS/effect-smol/commit/131caf9525151a0cb29803a8f1dffa0f4f479d12), [`c3615c8`](https://github.com/Effect-TS/effect-smol/commit/c3615c88379b9daf252df0db72c6ac5a20326406)]:
  - effect@4.0.0-beta.47

## 4.0.0-beta.46

### Patch Changes

- Updated dependencies [[`3a30b9e`](https://github.com/Effect-TS/effect-smol/commit/3a30b9e2ec2bd8b8193e1aa139f6878a07e3f5ee)]:
  - effect@4.0.0-beta.46

## 4.0.0-beta.45

### Patch Changes

- Updated dependencies [[`5c3af6d`](https://github.com/Effect-TS/effect-smol/commit/5c3af6d554f60be34f8fc21d598d9a298ae11beb)]:
  - effect@4.0.0-beta.45

## 4.0.0-beta.44

### Patch Changes

- [#1961](https://github.com/Effect-TS/effect-smol/pull/1961) [`7bb5dce`](https://github.com/Effect-TS/effect-smol/commit/7bb5dce60e1d904ef049a0287dec2b2e6113c970) Thanks @IMax153! - Rename the `ServiceMap` module to `Context` across exports, docs, and tests.

- Updated dependencies [[`e3f0621`](https://github.com/Effect-TS/effect-smol/commit/e3f0621454c3f5d11070d30619da27c9232cadc1), [`5b476ab`](https://github.com/Effect-TS/effect-smol/commit/5b476abc0bd7e9bb59135ea1bcad2e4936227ced), [`6b40e5a`](https://github.com/Effect-TS/effect-smol/commit/6b40e5a4a6bd2087c15a3d7374d25057fdedfa16), [`7bb5dce`](https://github.com/Effect-TS/effect-smol/commit/7bb5dce60e1d904ef049a0287dec2b2e6113c970), [`3b09fb3`](https://github.com/Effect-TS/effect-smol/commit/3b09fb31c40c2802b01f21c23bcdd1fe7fb0aa82), [`2370410`](https://github.com/Effect-TS/effect-smol/commit/237041062e5af4594d32db91597e34e70a632877), [`dabc272`](https://github.com/Effect-TS/effect-smol/commit/dabc272444a700eb629c07ba3e77671a841ca86e), [`08b63c3`](https://github.com/Effect-TS/effect-smol/commit/08b63c3df11bd35c9fd6090dbd166287fdc40664), [`dfff04c`](https://github.com/Effect-TS/effect-smol/commit/dfff04c4c2b1d352dfad83992a6dce1280c85cf9), [`9baed9e`](https://github.com/Effect-TS/effect-smol/commit/9baed9e17e84702e6e480fcef6f86404f9e24be9), [`7846792`](https://github.com/Effect-TS/effect-smol/commit/7846792adc7e1631d62d26d657bd7ba6139f369b), [`1556a24`](https://github.com/Effect-TS/effect-smol/commit/1556a247623636b7ebe438fb56d77f1a7bf957bb), [`7c11bc2`](https://github.com/Effect-TS/effect-smol/commit/7c11bc292ab8e46252fe8f7576fb685917bfb8b5), [`b5ea591`](https://github.com/Effect-TS/effect-smol/commit/b5ea5913ec1d45d0dd12a327b9dd966bda2f6d02), [`0853afa`](https://github.com/Effect-TS/effect-smol/commit/0853afaeb1633b2d7f8b66893bd01c3aa1ef2c22), [`ac845f3`](https://github.com/Effect-TS/effect-smol/commit/ac845f3ab40e0b8719576e7f9bc16ea2e0e02cd4), [`b80c462`](https://github.com/Effect-TS/effect-smol/commit/b80c46247480f47bb64fc480fab48a3f37bc8888), [`b3f535d`](https://github.com/Effect-TS/effect-smol/commit/b3f535d9a7ac13b5fb984c29f93561c57a081ff0), [`6fe2e93`](https://github.com/Effect-TS/effect-smol/commit/6fe2e93cc2f1b173ef89651d74b6a5d2626b3226), [`cda8004`](https://github.com/Effect-TS/effect-smol/commit/cda800451c1ffbdddfc08415aed7b2d91e0412ee), [`8335477`](https://github.com/Effect-TS/effect-smol/commit/8335477a8a936a24b5f3ee6203c1b268bd1bfc3c), [`8c836f9`](https://github.com/Effect-TS/effect-smol/commit/8c836f99ab1e896b9580a71d67773625baff2eaf), [`718ff6f`](https://github.com/Effect-TS/effect-smol/commit/718ff6fe3e3d3820cefd67d2bff1b2224fe08060), [`7eed84f`](https://github.com/Effect-TS/effect-smol/commit/7eed84fc33c5781a6fb11bf4fd189d424902ebd4), [`5df46fe`](https://github.com/Effect-TS/effect-smol/commit/5df46fe2f654d59ab5fc1578f4fc27fa40368ef9), [`82dd0f2`](https://github.com/Effect-TS/effect-smol/commit/82dd0f26c6442b07143762ef7bc33742d3978dd6), [`03ae41e`](https://github.com/Effect-TS/effect-smol/commit/03ae41e7304cffac9f18feea22b73468feafc43a), [`4677a0a`](https://github.com/Effect-TS/effect-smol/commit/4677a0a58f95eea38a211efcd3f345f237a9e44a), [`87e1fc8`](https://github.com/Effect-TS/effect-smol/commit/87e1fc8b67e4901d75f567b2fecc3841ab762cc4), [`c1af1b7`](https://github.com/Effect-TS/effect-smol/commit/c1af1b756f63291e9c0298cf95c98a6920a0c2a0), [`7bb5dce`](https://github.com/Effect-TS/effect-smol/commit/7bb5dce60e1d904ef049a0287dec2b2e6113c970), [`c8a877b`](https://github.com/Effect-TS/effect-smol/commit/c8a877b53e8f29616335719e5dd1c3992dddf780), [`7da961a`](https://github.com/Effect-TS/effect-smol/commit/7da961ae4916229d2246699a5d3b20e5b2dd2020)]:
  - effect@4.0.0-beta.44

## 4.0.0-beta.43

### Patch Changes

- Updated dependencies [[`2ae33d0`](https://github.com/Effect-TS/effect-smol/commit/2ae33d050914915f7cb9c25ab0a020901e08d596), [`979811a`](https://github.com/Effect-TS/effect-smol/commit/979811a4c3f7ed21ed18ef560c49fb7f5569e80e), [`eb7dbef`](https://github.com/Effect-TS/effect-smol/commit/eb7dbeffa883386ad912815e62c0820cac1fdf8e), [`cf50eb4`](https://github.com/Effect-TS/effect-smol/commit/cf50eb49cb04706dae5185f624708117c413dee8), [`1d046fe`](https://github.com/Effect-TS/effect-smol/commit/1d046fe484560e23f3e22cb23eec6433f8f1fa02)]:
  - effect@4.0.0-beta.43

## 4.0.0-beta.42

### Patch Changes

- Updated dependencies [[`924e216`](https://github.com/Effect-TS/effect-smol/commit/924e216caa7e0bbf22e994a0cd2ce8b1f0f0b3ee), [`80e7f0c`](https://github.com/Effect-TS/effect-smol/commit/80e7f0cd9116e811e97b0ce30a77a8d1ecd072aa), [`f8328bf`](https://github.com/Effect-TS/effect-smol/commit/f8328bf0314da3dc7f31d314f94a5840e8d5217f), [`66d1c06`](https://github.com/Effect-TS/effect-smol/commit/66d1c06039079129707a230f7ad8c676439d7133), [`bee800b`](https://github.com/Effect-TS/effect-smol/commit/bee800bf285192a01bec72a7b7b51bc1159434e6), [`8930441`](https://github.com/Effect-TS/effect-smol/commit/8930441dee6f94c59c583d18d3ebd677cf1f2623)]:
  - effect@4.0.0-beta.42

## 4.0.0-beta.41

### Patch Changes

- Updated dependencies [[`36f5c21`](https://github.com/Effect-TS/effect-smol/commit/36f5c2174d31ab42c4598bf81f178f40d0802283), [`d8ce758`](https://github.com/Effect-TS/effect-smol/commit/d8ce758669d6297ae932ac3251d83e7b49b22f30), [`11aab4c`](https://github.com/Effect-TS/effect-smol/commit/11aab4c6d37d5691adafc2d33da1a631b28ce814), [`3bc1efb`](https://github.com/Effect-TS/effect-smol/commit/3bc1efb53dd75b4a40de46f1f80c7f8a7d50af86), [`70e724e`](https://github.com/Effect-TS/effect-smol/commit/70e724e604604d4be1061cd8da0d360494998c84), [`738dee7`](https://github.com/Effect-TS/effect-smol/commit/738dee7edfd70af82dc4d2376db3a8ebe603eb48), [`2111963`](https://github.com/Effect-TS/effect-smol/commit/2111963f19b4c28c800664a8fac9590c1321885f), [`198a553`](https://github.com/Effect-TS/effect-smol/commit/198a553d9ce45f6a00bfc4d65ed0640669602d95)]:
  - effect@4.0.0-beta.41

## 4.0.0-beta.40

### Patch Changes

- Updated dependencies [[`f62860f`](https://github.com/Effect-TS/effect-smol/commit/f62860f0e5e45978fabf7256ae620a13152a772a), [`973f281`](https://github.com/Effect-TS/effect-smol/commit/973f2812529aadc1cc54598b2039799fa72b80f8)]:
  - effect@4.0.0-beta.40

## 4.0.0-beta.39

### Patch Changes

- Updated dependencies [[`f91fd3d`](https://github.com/Effect-TS/effect-smol/commit/f91fd3db39fe5628439fd175fba201a65a1aa9d0), [`edaae9d`](https://github.com/Effect-TS/effect-smol/commit/edaae9d65f464f941d7eddd723cd33d324f4b071), [`b47db0b`](https://github.com/Effect-TS/effect-smol/commit/b47db0bd5802064b6a24b3ea27c6ff2e0520d513), [`82d3c8e`](https://github.com/Effect-TS/effect-smol/commit/82d3c8e4f3f49b00df611b25aa6f8f74ec21b59b), [`7c22b31`](https://github.com/Effect-TS/effect-smol/commit/7c22b315d198dcbf44ae8cdb8b37879e1c9e3996)]:
  - effect@4.0.0-beta.39

## 4.0.0-beta.38

### Patch Changes

- Updated dependencies [[`f4dbe5b`](https://github.com/Effect-TS/effect-smol/commit/f4dbe5b26b9c2d33fae024bf44afbdf8541792cd), [`a71a607`](https://github.com/Effect-TS/effect-smol/commit/a71a607c89fb6669a12a562c2c23be81dfbe1adb), [`66a0494`](https://github.com/Effect-TS/effect-smol/commit/66a0494ed75cd12f2721dcbb1d8a072e3d9e14b6), [`5ef7218`](https://github.com/Effect-TS/effect-smol/commit/5ef7218fc559d57301fe929b8a0cab4033f4f1fd), [`472d260`](https://github.com/Effect-TS/effect-smol/commit/472d260655bc311fba5c2c6e23bb77d8f7e36ba0)]:
  - effect@4.0.0-beta.38

## 4.0.0-beta.37

### Patch Changes

- [#1812](https://github.com/Effect-TS/effect-smol/pull/1812) [`f7a0b71`](https://github.com/Effect-TS/effect-smol/commit/f7a0b711da8fdd645597dee29cacc5619c6afcf2) Thanks @tim-smart! - Consolidate the SqlError changes to the new reason-based shape across effect and the SQL drivers, classifying native failures into structured reasons with Unknown fallback where native codes are unavailable.

- Updated dependencies [[`f7a0b71`](https://github.com/Effect-TS/effect-smol/commit/f7a0b711da8fdd645597dee29cacc5619c6afcf2), [`1e223c3`](https://github.com/Effect-TS/effect-smol/commit/1e223c30ccf835dfbb21284535d78549efaeca80), [`53740f4`](https://github.com/Effect-TS/effect-smol/commit/53740f47aa76d114b7d535649fb50efc54a09608), [`8c7cf89`](https://github.com/Effect-TS/effect-smol/commit/8c7cf89f719e580cbce1bf6c24e6996f1992a0a6), [`b6b81a9`](https://github.com/Effect-TS/effect-smol/commit/b6b81a940eaafcbc792d25413d6c02c707de31b2), [`8f4c1f9`](https://github.com/Effect-TS/effect-smol/commit/8f4c1f97ed60f8810b0b327b50117ffb2d8260d4), [`f2479f9`](https://github.com/Effect-TS/effect-smol/commit/f2479f9d3113b1f012db17a3852b4e28f478cf9c), [`c919921`](https://github.com/Effect-TS/effect-smol/commit/c9199217fad65529421d2cf95ecfff41257090fd), [`7af90c2`](https://github.com/Effect-TS/effect-smol/commit/7af90c2e3c99038eafa39650433839523790e2fe), [`f3be185`](https://github.com/Effect-TS/effect-smol/commit/f3be18569e5ca57c25eabf00df3ca601ebab43c7)]:
  - effect@4.0.0-beta.37

## 4.0.0-beta.36

### Patch Changes

- Updated dependencies [[`60fcbcc`](https://github.com/Effect-TS/effect-smol/commit/60fcbcc43d09471e8f7e0969955d99dcefc5be81), [`0a60837`](https://github.com/Effect-TS/effect-smol/commit/0a6083713124440e630030375bab367e8d7df24e), [`49164d2`](https://github.com/Effect-TS/effect-smol/commit/49164d2c20a8d21b66514992c4a15d8521f6b36e), [`334b6e4`](https://github.com/Effect-TS/effect-smol/commit/334b6e4f76fe11941b516d61f57e268bc31f0ca6), [`5700695`](https://github.com/Effect-TS/effect-smol/commit/5700695f76ae6da6b94c9c87d4dd2b8054fb829b), [`f8f4456`](https://github.com/Effect-TS/effect-smol/commit/f8f445644f3aa7ec093cab7445198a62ba18a480), [`969d24f`](https://github.com/Effect-TS/effect-smol/commit/969d24fdfa48c4838e811983848d9cb4e9b3b12c), [`851eda0`](https://github.com/Effect-TS/effect-smol/commit/851eda0533946e39bacaaf581896320d7a4f3e8c), [`8059c1c`](https://github.com/Effect-TS/effect-smol/commit/8059c1c3eba9a90af7cd889ea261bcb8fff0c185), [`6f83295`](https://github.com/Effect-TS/effect-smol/commit/6f8329546a73eaddc7cb5e85ea8e37e73fbfb611), [`65f7f57`](https://github.com/Effect-TS/effect-smol/commit/65f7f5737575fed668987462c96d29a446707c32), [`e7fabd2`](https://github.com/Effect-TS/effect-smol/commit/e7fabd2265db690eae5cfc9b83730c84699aef61), [`89c3e98`](https://github.com/Effect-TS/effect-smol/commit/89c3e985401eb38f33a3ae21a94ad27de3c1d28b), [`53794ab`](https://github.com/Effect-TS/effect-smol/commit/53794ab7af30aa5c5004ecf53659fafbe4b10542)]:
  - effect@4.0.0-beta.36

## 4.0.0-beta.35

### Patch Changes

- Updated dependencies [[`9252b43`](https://github.com/Effect-TS/effect-smol/commit/9252b43560f507709c2985abcf52a7837b23ddf8), [`7daf387`](https://github.com/Effect-TS/effect-smol/commit/7daf3870a656882a488a60f67881e6808c8f4d04), [`e1664a3`](https://github.com/Effect-TS/effect-smol/commit/e1664a38bc31ef4ceb4e9324c7226e1e99bf9c07), [`fdaa6e0`](https://github.com/Effect-TS/effect-smol/commit/fdaa6e0a41b6b6605438fa8557441792135380a2), [`19aa47e`](https://github.com/Effect-TS/effect-smol/commit/19aa47ef7b470e427620edca8970dd9cdd551216), [`c667dad`](https://github.com/Effect-TS/effect-smol/commit/c667dad07777b860e4764a3ba9a6cc41c236cd98), [`764d150`](https://github.com/Effect-TS/effect-smol/commit/764d1501bc5026b60fc8aef6cb02a5a87c762801), [`3c27098`](https://github.com/Effect-TS/effect-smol/commit/3c27098b5685a63db2c2eff654a250c94d3fcfa7)]:
  - effect@4.0.0-beta.35

## 4.0.0-beta.34

### Patch Changes

- Updated dependencies [[`f2f75ee`](https://github.com/Effect-TS/effect-smol/commit/f2f75ee564bce1cd95f5189c7bdeeed4f92dacb1), [`342fc4b`](https://github.com/Effect-TS/effect-smol/commit/342fc4b051739e32e7977159f26ff9541eda664f), [`5d704ee`](https://github.com/Effect-TS/effect-smol/commit/5d704ee10d20e8eb107e34bb8a21feb5aa4a7685), [`00add69`](https://github.com/Effect-TS/effect-smol/commit/00add69b59551e9df34772eb927638b093f6d71e), [`58217d3`](https://github.com/Effect-TS/effect-smol/commit/58217d318a7d716ccd707cce0f41573946939c28), [`f4e2aba`](https://github.com/Effect-TS/effect-smol/commit/f4e2aba01b76d1e3059b297e3cc942284dfeafb2), [`e3b44b6`](https://github.com/Effect-TS/effect-smol/commit/e3b44b6a2af9ee21dc5c1e928f0c20af857fa7a9), [`e1472b7`](https://github.com/Effect-TS/effect-smol/commit/e1472b7525c5d57a48bdec2353c3b742f7f916c0), [`7686320`](https://github.com/Effect-TS/effect-smol/commit/7686320cd123fa352b5c3d076fb18a3cac0a9bba)]:
  - effect@4.0.0-beta.34

## 4.0.0-beta.33

### Patch Changes

- Updated dependencies [[`571447d`](https://github.com/Effect-TS/effect-smol/commit/571447da67334449f8ae3d6ecb3d77ea4e0c4295)]:
  - effect@4.0.0-beta.33

## 4.0.0-beta.32

### Patch Changes

- Updated dependencies [[`bf8fff8`](https://github.com/Effect-TS/effect-smol/commit/bf8fff8a5f54b6df74cb7bbb42346fe9ba52435a), [`1af3ef3`](https://github.com/Effect-TS/effect-smol/commit/1af3ef3e3ca7fd417d0fc15f8ca8fe207eba4f74), [`27fea0f`](https://github.com/Effect-TS/effect-smol/commit/27fea0f66910de5905f40fd63f8ddbb6f7ac5aba), [`2ad6c1b`](https://github.com/Effect-TS/effect-smol/commit/2ad6c1b2c85a3a0fe351e3d56636a75eb76b4b4e), [`398ac3e`](https://github.com/Effect-TS/effect-smol/commit/398ac3e01cb75efce0e4e2913d1450cf65866732), [`51fe22f`](https://github.com/Effect-TS/effect-smol/commit/51fe22f3266e417b6c541aaed4b75d246fac91e7), [`4605db6`](https://github.com/Effect-TS/effect-smol/commit/4605db69cfacddbdbf1525865ddfde135158090c), [`f4de1b0`](https://github.com/Effect-TS/effect-smol/commit/f4de1b087c998d0bad1d9468f70b7d16c13b9f6f), [`60214f2`](https://github.com/Effect-TS/effect-smol/commit/60214f2080b2aeb091f691140eb20acb741691c3), [`c4b8b0f`](https://github.com/Effect-TS/effect-smol/commit/c4b8b0ffa8efb47c4cd7578a8943d6868509373f), [`6d9393a`](https://github.com/Effect-TS/effect-smol/commit/6d9393a0770a18722d23340e77f15455de341245), [`6de4efe`](https://github.com/Effect-TS/effect-smol/commit/6de4efe463c783614ceb0c094d77a336a899cbe0), [`4f969d1`](https://github.com/Effect-TS/effect-smol/commit/4f969d1563ba755ffa116c8ae409bb3436bd881d), [`6cc67c8`](https://github.com/Effect-TS/effect-smol/commit/6cc67c855e054ee3f3ac3485dca5f7805e79e8fb), [`8531a22`](https://github.com/Effect-TS/effect-smol/commit/8531a22ffbb52e11a030b09f358cafbfdf5edff7), [`b226760`](https://github.com/Effect-TS/effect-smol/commit/b22676067617f15c00722a3a63fd7c2c172c3d45), [`47a51ab`](https://github.com/Effect-TS/effect-smol/commit/47a51aba0ecdf3ef478bfa28a498bca188399bd4), [`1521d02`](https://github.com/Effect-TS/effect-smol/commit/1521d02e1f19f1d795edaaf862c1a1031d9c755e)]:
  - effect@4.0.0-beta.32

## 4.0.0-beta.31

### Patch Changes

- Updated dependencies [[`5a84853`](https://github.com/Effect-TS/effect-smol/commit/5a8485397b7f321ae021640c1999821143659462), [`6f23f0e`](https://github.com/Effect-TS/effect-smol/commit/6f23f0ed4cba573cd9395c2e582f582fe7271544), [`654aaec`](https://github.com/Effect-TS/effect-smol/commit/654aaec593305521b65dd042c204d761cc6e8c28), [`2958a42`](https://github.com/Effect-TS/effect-smol/commit/2958a42078966a8713a98f00485ab36484d5eccf), [`95d27a2`](https://github.com/Effect-TS/effect-smol/commit/95d27a239ed5147302605ab0b3147a056541b0c7), [`0fbaea8`](https://github.com/Effect-TS/effect-smol/commit/0fbaea8f9555a8044cec31a770394db613fc78e2), [`21d5d5e`](https://github.com/Effect-TS/effect-smol/commit/21d5d5e0439fd4d9bb6e508377215b1087555d45), [`5a84853`](https://github.com/Effect-TS/effect-smol/commit/5a8485397b7f321ae021640c1999821143659462), [`6e49959`](https://github.com/Effect-TS/effect-smol/commit/6e499590357a104c81779b3176cd3f84e4f91064), [`8f5805d`](https://github.com/Effect-TS/effect-smol/commit/8f5805dbdd0d1bc0ff0727cc398c8d80e544edee), [`990df2c`](https://github.com/Effect-TS/effect-smol/commit/990df2c3ceeb32e659acc10cc9485617f7b3c423)]:
  - effect@4.0.0-beta.31

## 4.0.0-beta.30

### Patch Changes

- Updated dependencies [[`c88e5b7`](https://github.com/Effect-TS/effect-smol/commit/c88e5b723ff09da4edaef6ce14d927ca01104a32), [`947d0e4`](https://github.com/Effect-TS/effect-smol/commit/947d0e4268ba5c4020ead380aa80812c7342408f), [`7517908`](https://github.com/Effect-TS/effect-smol/commit/75179085d159b88a1ab0bce70669d76dcf0d79a4), [`a49ecd5`](https://github.com/Effect-TS/effect-smol/commit/a49ecd5a183d7e7d33f47ff95e9d2dea5a12ead5), [`6993e33`](https://github.com/Effect-TS/effect-smol/commit/6993e3329122c834c20bacea72d8678232f4f103), [`514f2a2`](https://github.com/Effect-TS/effect-smol/commit/514f2a2ae54580fcacdbe2ea2196a83a852d0748), [`3214b47`](https://github.com/Effect-TS/effect-smol/commit/3214b47676de2d33fddc5fecfc2d226e6e83cc7b), [`95ec5ed`](https://github.com/Effect-TS/effect-smol/commit/95ec5ed345de77c893049e182d37a37cf164a268)]:
  - effect@4.0.0-beta.30

## 4.0.0-beta.29

### Patch Changes

- Updated dependencies [[`9d93adb`](https://github.com/Effect-TS/effect-smol/commit/9d93adb1c1795d1978391b30d7d2972c88052662), [`b52721c`](https://github.com/Effect-TS/effect-smol/commit/b52721cf0d11a567722b060c8536e3bdd4161f07), [`a891c7b`](https://github.com/Effect-TS/effect-smol/commit/a891c7b12f415b2287613dd4b91a09dfd38ef30d), [`ef26cdf`](https://github.com/Effect-TS/effect-smol/commit/ef26cdfb65d9955fc7e161629191930c2cc2c63f), [`82fd3ed`](https://github.com/Effect-TS/effect-smol/commit/82fd3ed922063ee5a34f96f3993c15c7515e4f67)]:
  - effect@4.0.0-beta.29

## 4.0.0-beta.28

### Patch Changes

- Updated dependencies [[`ff533f2`](https://github.com/Effect-TS/effect-smol/commit/ff533f203cd06302ad08032a27e01269b4a2d4c6), [`dc803ee`](https://github.com/Effect-TS/effect-smol/commit/dc803ee52ebd3e9f931118f0dfcb804542847556), [`d660b1c`](https://github.com/Effect-TS/effect-smol/commit/d660b1c99cb93d4f79715e91c7a4486801c0eefa), [`93a05e3`](https://github.com/Effect-TS/effect-smol/commit/93a05e3eaa624058b162aedd66aad70102837270), [`2a65cf6`](https://github.com/Effect-TS/effect-smol/commit/2a65cf6fd81ef63d944e6fb51f058d439bf4a834), [`a561a40`](https://github.com/Effect-TS/effect-smol/commit/a561a40cc41c548c2cf3153aca065ee92ee8aa57), [`29cd24d`](https://github.com/Effect-TS/effect-smol/commit/29cd24d1fe78480a72eeb38a90281ffddc0530bc), [`662a8e6`](https://github.com/Effect-TS/effect-smol/commit/662a8e6857dac64a7cd13bd8df4b0674654622f8), [`d2b52ba`](https://github.com/Effect-TS/effect-smol/commit/d2b52bae5b9336cf59729fbdcc4d7f09512b0cbf), [`407c3b4`](https://github.com/Effect-TS/effect-smol/commit/407c3b43a5d1414558e0e33b6f1fc0e6a6d489cc), [`42bc7ce`](https://github.com/Effect-TS/effect-smol/commit/42bc7ce5480f6f2953c39f8cb5c850d61df6f5a2), [`e741322`](https://github.com/Effect-TS/effect-smol/commit/e74132226cbfee24234311c7c1c13e6b7391384e), [`5c75fa8`](https://github.com/Effect-TS/effect-smol/commit/5c75fa8fb71163bc4c035ba1a215574dfd4badfc), [`747177b`](https://github.com/Effect-TS/effect-smol/commit/747177b0602f12d4461a843e953dfdffbeb0a429), [`326cd48`](https://github.com/Effect-TS/effect-smol/commit/326cd4828bce573fe985f35152155464bf4c5a70), [`627e922`](https://github.com/Effect-TS/effect-smol/commit/627e922b8d1e9521eae5e1caa5d667ad00b1619a), [`662287e`](https://github.com/Effect-TS/effect-smol/commit/662287e9abc76c941ccc2ee330aa07904d571341)]:
  - effect@4.0.0-beta.28

## 4.0.0-beta.27

### Patch Changes

- Updated dependencies [[`903a839`](https://github.com/Effect-TS/effect-smol/commit/903a839e94239e6ec4568315af28e405bcad95f4), [`91a0168`](https://github.com/Effect-TS/effect-smol/commit/91a016836680a6669308ecf464d3584bcc4ae1b7), [`c890f9a`](https://github.com/Effect-TS/effect-smol/commit/c890f9a1b3a989ed22528bd5a43326342e05b142), [`1e985f2`](https://github.com/Effect-TS/effect-smol/commit/1e985f237d250b51b91de22dde77160c1e778ce7)]:
  - effect@4.0.0-beta.27

## 4.0.0-beta.26

### Patch Changes

- Updated dependencies [[`fb21462`](https://github.com/Effect-TS/effect-smol/commit/fb21462642cdd5b1bada92f3eba18ae20445be42), [`2ed26b1`](https://github.com/Effect-TS/effect-smol/commit/2ed26b139805700e3df39efaa768ff01565e5c86), [`e832a57`](https://github.com/Effect-TS/effect-smol/commit/e832a57b570fe38f010c1fd99bceac5a325a9e07), [`7f01be7`](https://github.com/Effect-TS/effect-smol/commit/7f01be7f8db363d4b2e88e6b5571e96bb815786f), [`e965143`](https://github.com/Effect-TS/effect-smol/commit/e9651431e114479e6becf8ca7b1ed99ac7e91ccc), [`b9b80f1`](https://github.com/Effect-TS/effect-smol/commit/b9b80f1f15e152ceef0a727d150b7dc230abae99), [`98252aa`](https://github.com/Effect-TS/effect-smol/commit/98252aa0c0b17fc73fbdad65d0a1104965f9fc0f), [`56fbd94`](https://github.com/Effect-TS/effect-smol/commit/56fbd94311ad19a05001ad649d9e34ab00c74541), [`3faa109`](https://github.com/Effect-TS/effect-smol/commit/3faa109b7d093fbf14ad410d3e11d663f16e28f1), [`692ecfe`](https://github.com/Effect-TS/effect-smol/commit/692ecfed99fe58056b7a5afe001f4fcd1a61c446), [`1e70b72`](https://github.com/Effect-TS/effect-smol/commit/1e70b72d0b210474d0e96a15a5cfc279eae37e0c), [`ecf0782`](https://github.com/Effect-TS/effect-smol/commit/ecf07829ef2dfc01d8943c96c4fe9c1b44b97926)]:
  - effect@4.0.0-beta.26

## 4.0.0-beta.25

### Patch Changes

- Updated dependencies [[`fa17bb5`](https://github.com/Effect-TS/effect-smol/commit/fa17bb5be9f2533d01e11322b14804c7dec43714), [`f46e5b5`](https://github.com/Effect-TS/effect-smol/commit/f46e5b5ca2a918ee4d9270167e79db223077c96f), [`ce4767c`](https://github.com/Effect-TS/effect-smol/commit/ce4767cadcacc6ce8ff4c3a0d0fbc82ede655f63), [`c830a8b`](https://github.com/Effect-TS/effect-smol/commit/c830a8b6c292a6528d7f9318759d34800b00372d)]:
  - effect@4.0.0-beta.25

## 4.0.0-beta.24

### Patch Changes

- Updated dependencies [[`a909e1c`](https://github.com/Effect-TS/effect-smol/commit/a909e1c1ac2bc707527f5073776e3e7d239688d9), [`8814a4e`](https://github.com/Effect-TS/effect-smol/commit/8814a4ef78d67144d27689370af10099ea210399), [`3f942c5`](https://github.com/Effect-TS/effect-smol/commit/3f942c51cefa7b2ffa7c49e8c8a2c887570ba4c0), [`774ed59`](https://github.com/Effect-TS/effect-smol/commit/774ed59c52b2ab578bbb897c4f551f812231e1d2), [`f54b8d3`](https://github.com/Effect-TS/effect-smol/commit/f54b8d398fedad1815fd1f4c49814ab938cfc385)]:
  - effect@4.0.0-beta.24

## 4.0.0-beta.23

### Patch Changes

- Updated dependencies [[`5c73c41`](https://github.com/Effect-TS/effect-smol/commit/5c73c41b69eaeab80fcd62c9bfda490b446d1966)]:
  - effect@4.0.0-beta.23

## 4.0.0-beta.22

### Patch Changes

- Updated dependencies [[`0874332`](https://github.com/Effect-TS/effect-smol/commit/0874332f7c81118b06ac2eb105e0710211631479), [`c592dcd`](https://github.com/Effect-TS/effect-smol/commit/c592dcde0697e322065c8f418c0480ef910cb183), [`1dbe28d`](https://github.com/Effect-TS/effect-smol/commit/1dbe28dac8299cd3e218c9768450cfd173b5e294), [`564d730`](https://github.com/Effect-TS/effect-smol/commit/564d730b6bbf38dd8548a3b046e7a693b28699a4), [`3cfadc4`](https://github.com/Effect-TS/effect-smol/commit/3cfadc458b070c6cba6c5674b72a059f1e49118b), [`6634fd0`](https://github.com/Effect-TS/effect-smol/commit/6634fd07da067d80b8261fb2959d1a952b9e412e), [`d10dabe`](https://github.com/Effect-TS/effect-smol/commit/d10dabeb7af9a368f995829cd36ad08167cd8f95), [`f82f549`](https://github.com/Effect-TS/effect-smol/commit/f82f549a09e950e9d4987f279a800f4d953f0939), [`78a3382`](https://github.com/Effect-TS/effect-smol/commit/78a3382ddfbe034408f7480fa794733d9e82147b)]:
  - effect@4.0.0-beta.22

## 4.0.0-beta.21

### Patch Changes

- Updated dependencies [[`e691909`](https://github.com/Effect-TS/effect-smol/commit/e691909495ccb162ea7bfa351dd74632b99997cb), [`d5f413f`](https://github.com/Effect-TS/effect-smol/commit/d5f413f3c8fc57f2413cc5649c2003d6d4e5a6d7), [`139d152`](https://github.com/Effect-TS/effect-smol/commit/139d152941e562a073b5be12e8d66c8a4d4a8a57), [`947e3d4`](https://github.com/Effect-TS/effect-smol/commit/947e3d436ab8a017efda9b29be523efd1ca8df28), [`84b2cce`](https://github.com/Effect-TS/effect-smol/commit/84b2ccefe2aa3a7413b86738a4dc33cdb311ca55), [`7f5305e`](https://github.com/Effect-TS/effect-smol/commit/7f5305e69f5a33309e77b08a576edb25d7daaee2), [`9e6fd84`](https://github.com/Effect-TS/effect-smol/commit/9e6fd8471c93a3c643929151a3bdb62cb9c0ca0e), [`fdb8a4b`](https://github.com/Effect-TS/effect-smol/commit/fdb8a4b172721fbefe98bd5aa6fe4f0efd1da3eb), [`0f986ef`](https://github.com/Effect-TS/effect-smol/commit/0f986ef22f196fe091a7afdbd179485a7d888882), [`9355fc0`](https://github.com/Effect-TS/effect-smol/commit/9355fc0ffb5b7382146a5aed9eea83974b10d007)]:
  - effect@4.0.0-beta.21

## 4.0.0-beta.20

### Patch Changes

- Updated dependencies [[`842a624`](https://github.com/Effect-TS/effect-smol/commit/842a624f79d5e1407460b0ef3ab27d14d48ccf74), [`4785eef`](https://github.com/Effect-TS/effect-smol/commit/4785eef5d7cf1edb96ef2509aed2ba4d1edf3862), [`8fac95b`](https://github.com/Effect-TS/effect-smol/commit/8fac95bd9e0338b7a82da8da579c1ac22afa045c), [`12ee8e2`](https://github.com/Effect-TS/effect-smol/commit/12ee8e27df7eb393d83a5e403390d0cfc82ca732), [`e542c94`](https://github.com/Effect-TS/effect-smol/commit/e542c942bee4729138b02222f4421220a90a57d8), [`8fac95b`](https://github.com/Effect-TS/effect-smol/commit/8fac95bd9e0338b7a82da8da579c1ac22afa045c), [`6f4ebd1`](https://github.com/Effect-TS/effect-smol/commit/6f4ebd193c2595983394127dd808601b75430d34), [`989d1cc`](https://github.com/Effect-TS/effect-smol/commit/989d1cca936fce0cc459057825ba40e3f5ef3827)]:
  - effect@4.0.0-beta.20

## 4.0.0-beta.19

### Patch Changes

- Updated dependencies []:
  - effect@4.0.0-beta.19

## 4.0.0-beta.18

### Patch Changes

- Updated dependencies [[`01e31fd`](https://github.com/Effect-TS/effect-smol/commit/01e31fdf8e5206849d23cbafd23a346f2f177ab8), [`0890aab`](https://github.com/Effect-TS/effect-smol/commit/0890aab15ed9c5ba52c383a72fdc6a444d7504d5), [`725260b`](https://github.com/Effect-TS/effect-smol/commit/725260b53f5142d6af7a93a2f9f464f974eda92d)]:
  - effect@4.0.0-beta.18

## 4.0.0-beta.17

### Patch Changes

- Updated dependencies [[`8f59c32`](https://github.com/Effect-TS/effect-smol/commit/8f59c32922597a48392744f7203e284866747781)]:
  - effect@4.0.0-beta.17

## 4.0.0-beta.16

### Patch Changes

- Updated dependencies [[`bf9096c`](https://github.com/Effect-TS/effect-smol/commit/bf9096c52a7d8791d93d232739e523eb84f6625a), [`29f81ca`](https://github.com/Effect-TS/effect-smol/commit/29f81ca07c67dba265804b140a7487fb15a5fc6b), [`68eb28c`](https://github.com/Effect-TS/effect-smol/commit/68eb28c2b0fc67a9f6204ade9bd16c5b37803bfb)]:
  - effect@4.0.0-beta.16

## 4.0.0-beta.15

### Patch Changes

- Updated dependencies [[`24ae609`](https://github.com/Effect-TS/effect-smol/commit/24ae60995d2fd7d621be356cdfdfd328c79639ba), [`0e3c059`](https://github.com/Effect-TS/effect-smol/commit/0e3c059987caa55ebd0c134f7c7b147c639c328e), [`e843b0a`](https://github.com/Effect-TS/effect-smol/commit/e843b0a7d7e7b600a0b3bd477f24e2e4cd26bc8b), [`f4389a2`](https://github.com/Effect-TS/effect-smol/commit/f4389a2cca3c5bbf00d69779f52ce41255f15a28), [`5b73de0`](https://github.com/Effect-TS/effect-smol/commit/5b73de095b3402d0c5c74092ace6ce18ebfad566), [`595d2d6`](https://github.com/Effect-TS/effect-smol/commit/595d2d6e7d50419f3532bd39266191532ace38f2)]:
  - effect@4.0.0-beta.15

## 4.0.0-beta.14

### Patch Changes

- Updated dependencies [[`c414700`](https://github.com/Effect-TS/effect-smol/commit/c414700ef1932e4b67d0102856de417336912350), [`a30c969`](https://github.com/Effect-TS/effect-smol/commit/a30c9699c0d736cf3952041e45d508b7d58907a9)]:
  - effect@4.0.0-beta.14

## 4.0.0-beta.13

### Patch Changes

- Updated dependencies [[`368f4c3`](https://github.com/Effect-TS/effect-smol/commit/368f4c363dd117e6f5a19ad77b161176cfd29fdd), [`db8a579`](https://github.com/Effect-TS/effect-smol/commit/db8a579e93e93ff73b1e60712732e03b597b916b), [`668b703`](https://github.com/Effect-TS/effect-smol/commit/668b70337e9ddbb0d1ae2282a95c282ce404e562), [`d40e76b`](https://github.com/Effect-TS/effect-smol/commit/d40e76b973543979e60e04a6baca04a8c65bdfc2), [`6e18cf8`](https://github.com/Effect-TS/effect-smol/commit/6e18cf883e9905ca718a6697b6a2a4bbd42739aa), [`86062e8`](https://github.com/Effect-TS/effect-smol/commit/86062e8a0c61bca5412fc40d2cf151d676901f08), [`c27ce75`](https://github.com/Effect-TS/effect-smol/commit/c27ce75d34c74dcfc6dba1bf77f1ce88f410a0de), [`e2d4fbf`](https://github.com/Effect-TS/effect-smol/commit/e2d4fbfeeda6a5d2a4c5aeb0501d8240c248b9eb), [`114ab42`](https://github.com/Effect-TS/effect-smol/commit/114ab42ad0edc590d29169675a493e0e915aa58f), [`484caec`](https://github.com/Effect-TS/effect-smol/commit/484caec47cccac8b86db2910742e406dfc7173ab)]:
  - effect@4.0.0-beta.13

## 4.0.0-beta.12

### Patch Changes

- Updated dependencies [[`70a74e8`](https://github.com/Effect-TS/effect-smol/commit/70a74e88a8767c9d4acdb9e5f25aec9a33588d07), [`b5b6e10`](https://github.com/Effect-TS/effect-smol/commit/b5b6e10621d54bf8c9857fec0d647ced78ecd857), [`f5ce5a9`](https://github.com/Effect-TS/effect-smol/commit/f5ce5a915359c6ebf254079e1da23cab6cde34fb), [`a29eb70`](https://github.com/Effect-TS/effect-smol/commit/a29eb702ffe3fc58bd28c4d7857298cd65d73668), [`c7b36e5`](https://github.com/Effect-TS/effect-smol/commit/c7b36e541a23e9a00f64e25b23851e51a37dfce5), [`9381d6d`](https://github.com/Effect-TS/effect-smol/commit/9381d6d4d9d819a81a46e56d0364c76e92a4fbca), [`88439f1`](https://github.com/Effect-TS/effect-smol/commit/88439f13ca13549f3e4822c48c4f019c14fc2bcc), [`e35307d`](https://github.com/Effect-TS/effect-smol/commit/e35307dbeb8eb26a9923f958b894a8eaaf259bf2), [`c7df4bc`](https://github.com/Effect-TS/effect-smol/commit/c7df4bce34009474c63d62a807abfdafb76971eb), [`accaf3b`](https://github.com/Effect-TS/effect-smol/commit/accaf3be7ac8da36e2334c509c23b8c9e88ea160), [`3e1c270`](https://github.com/Effect-TS/effect-smol/commit/3e1c2707bbdf67720af1509642b8ced195790882), [`6cd81f7`](https://github.com/Effect-TS/effect-smol/commit/6cd81f73baad86f5bbfa455a55d75cde71e9611a), [`f222da3`](https://github.com/Effect-TS/effect-smol/commit/f222da3cdb44554f3324c2c52d0d005ee575053e), [`61f901d`](https://github.com/Effect-TS/effect-smol/commit/61f901d830005b66e22d1de889fda132aeea97cd)]:
  - effect@4.0.0-beta.12

## 4.0.0-beta.11

### Patch Changes

- Updated dependencies [[`88659ed`](https://github.com/Effect-TS/effect-smol/commit/88659edb26e3623d557dccfe914c2c949672da16), [`f2915e8`](https://github.com/Effect-TS/effect-smol/commit/f2915e8e2efe80d50c281e53f297b9701d6dc199), [`eb71ace`](https://github.com/Effect-TS/effect-smol/commit/eb71acebbe0f228e4920278013beee3b67d62310), [`2a16999`](https://github.com/Effect-TS/effect-smol/commit/2a169996c7513d377ac47adbfd68e1490457135c), [`d42dd52`](https://github.com/Effect-TS/effect-smol/commit/d42dd52f11203f8e749fb5d3ecf7153e4a5a6814), [`339adaf`](https://github.com/Effect-TS/effect-smol/commit/339adaf850a62a892adebcb208c2d9dddf3b97b3), [`de19645`](https://github.com/Effect-TS/effect-smol/commit/de1964526d01102dd1cb99c8cfdd3e8df1f49ef1), [`9b1dc3b`](https://github.com/Effect-TS/effect-smol/commit/9b1dc3bcf2a1b68d0a67e3465db5ad01a1a56997), [`e4cb2f5`](https://github.com/Effect-TS/effect-smol/commit/e4cb2f55b30f4771ec1bf613ced36d6d96464dd5), [`8bced95`](https://github.com/Effect-TS/effect-smol/commit/8bced954ecb35d4489197a57b0efe927e7d75f49), [`9431420`](https://github.com/Effect-TS/effect-smol/commit/94314207c8019918200fbcb97aec992219f801f0), [`948dca2`](https://github.com/Effect-TS/effect-smol/commit/948dca22e4f672ba7a6db57f9899272bec7c08b8), [`d18e327`](https://github.com/Effect-TS/effect-smol/commit/d18e32765a2665e31ffb31e746bf983fcfac34c5), [`ab512f7`](https://github.com/Effect-TS/effect-smol/commit/ab512f7be1c0e6b359da921e22cd4944e4c57d3e)]:
  - effect@4.0.0-beta.11

## 4.0.0-beta.10

### Patch Changes

- Updated dependencies [[`371acab`](https://github.com/Effect-TS/effect-smol/commit/371acabb58d56f3a7a5e3e33d3d5fdc9f5573c74), [`856d774`](https://github.com/Effect-TS/effect-smol/commit/856d7741f1e296dd5048c6ff2b44b95d023e6ae4), [`b9e9202`](https://github.com/Effect-TS/effect-smol/commit/b9e92023c38caa322975d77cfe83e2d34ac9305a), [`1d1a974`](https://github.com/Effect-TS/effect-smol/commit/1d1a974bd280c81bff5d4505491cda03ba7a3f36), [`6bfe2a6`](https://github.com/Effect-TS/effect-smol/commit/6bfe2a659bc6335db75709931f405da45301cba2), [`b12c811`](https://github.com/Effect-TS/effect-smol/commit/b12c81157be287b1649c210616a244b50ec094d2), [`d17d98a`](https://github.com/Effect-TS/effect-smol/commit/d17d98ad78e2b44d95ef434adab79ac3c35e75ab), [`68c3c7c`](https://github.com/Effect-TS/effect-smol/commit/68c3c7cb1e06ed94fa5c4c123a234b4ccbfdecd8)]:
  - effect@4.0.0-beta.10

## 4.0.0-beta.9

### Patch Changes

- Updated dependencies [[`3386557`](https://github.com/Effect-TS/effect-smol/commit/338655731564a7be9f8859dedbf4d5bcac6eb350), [`b6666e3`](https://github.com/Effect-TS/effect-smol/commit/b6666e3cf6bd44ba1a8704e65c256c30359cb422)]:
  - effect@4.0.0-beta.9

## 4.0.0-beta.8

### Patch Changes

- Updated dependencies [[`246e672`](https://github.com/Effect-TS/effect-smol/commit/246e672dbbd7848d60e0c78fd66671b2f10b3752), [`807dec0`](https://github.com/Effect-TS/effect-smol/commit/807dec03801b4c58a6d00c237b6d98d6386911df)]:
  - effect@4.0.0-beta.8

## 4.0.0-beta.7

### Patch Changes

- Updated dependencies [[`a2bda6d`](https://github.com/Effect-TS/effect-smol/commit/a2bda6d4ef6de9d9b0c53ae2df5434f778d6161a), [`1f95a2b`](https://github.com/Effect-TS/effect-smol/commit/1f95a2b5aa9524bb38f4437f4691a664bf463ca1), [`a8d5e79`](https://github.com/Effect-TS/effect-smol/commit/a8d5e792fec201a83af0eb92fc79928d055125fd), [`a5386ba`](https://github.com/Effect-TS/effect-smol/commit/a5386ba67005dff697d45a45398f398773f58dcf), [`a5386ba`](https://github.com/Effect-TS/effect-smol/commit/a5386ba67005dff697d45a45398f398773f58dcf), [`06d8a03`](https://github.com/Effect-TS/effect-smol/commit/06d8a0391631e6130e3ab25227e59817852e227f), [`8caac76`](https://github.com/Effect-TS/effect-smol/commit/8caac76a35821edfe03c75dab5eb056e8fc05430), [`8caac76`](https://github.com/Effect-TS/effect-smol/commit/8caac76a35821edfe03c75dab5eb056e8fc05430), [`f9e883e`](https://github.com/Effect-TS/effect-smol/commit/f9e883e266fbda870336ee62f46b7ac85ba3de6e), [`8caac76`](https://github.com/Effect-TS/effect-smol/commit/8caac76a35821edfe03c75dab5eb056e8fc05430)]:
  - effect@4.0.0-beta.7

## 4.0.0-beta.6

### Patch Changes

- Updated dependencies [[`3247da2`](https://github.com/Effect-TS/effect-smol/commit/3247da28331f345f68be5dbd2974a7e03d300fe1), [`f205705`](https://github.com/Effect-TS/effect-smol/commit/f2057050dbd034b8c186be2d40c3d03ee63a5a3b), [`f35022c`](https://github.com/Effect-TS/effect-smol/commit/f35022c212e4111527e1bb43f360a67b2b49fa85), [`8622721`](https://github.com/Effect-TS/effect-smol/commit/86227217b02d43680a3c6f3c21731b1d852c91f5), [`fc660ab`](https://github.com/Effect-TS/effect-smol/commit/fc660ab8b5ebae38b8d6b96cbf2f9b880cc09253), [`f37dc33`](https://github.com/Effect-TS/effect-smol/commit/f37dc335f64622fa9ce8d6d1d5dd8fc3f260257b), [`3662f32`](https://github.com/Effect-TS/effect-smol/commit/3662f328fcfa3b2fa01ffa79da40e12e93fcede8), [`a7d436f`](https://github.com/Effect-TS/effect-smol/commit/a7d436f438dcd7f49b9485e4e95a4511f31fad7d), [`6856a41`](https://github.com/Effect-TS/effect-smol/commit/6856a415d7eddd9d73d60919e976f1d071421be4), [`8c417d0`](https://github.com/Effect-TS/effect-smol/commit/8c417d03475e5e12d00dca0c4781d0af7e66b86c), [`5419570`](https://github.com/Effect-TS/effect-smol/commit/5419570ba47ce882a3a10882707b46f66e464906), [`449c5ed`](https://github.com/Effect-TS/effect-smol/commit/449c5ed5318e8a874e730420bcf52918fa2ec80f), [`4b5ec12`](https://github.com/Effect-TS/effect-smol/commit/4b5ec12f87f95f2a3cd8fe4d5b26c6eb0529381a), [`df87937`](https://github.com/Effect-TS/effect-smol/commit/df879375fc3b169c43f9c434b3775e12b80dffe4), [`5dbfca8`](https://github.com/Effect-TS/effect-smol/commit/5dbfca8d1dbb6d18d1605d4f8562e99c86e2ff11), [`e629497`](https://github.com/Effect-TS/effect-smol/commit/e6294973d55597ab6b6deca6babbe1e946b2c91d), [`981c991`](https://github.com/Effect-TS/effect-smol/commit/981c991cd78db34def815d5754379d737157f005), [`1ca2ed6`](https://github.com/Effect-TS/effect-smol/commit/1ca2ed67301a5dc40ae0ed94346b99f26fd22bbe), [`45722bd`](https://github.com/Effect-TS/effect-smol/commit/45722bde974458311f11ad237711363a10ec6894), [`eb2a85e`](https://github.com/Effect-TS/effect-smol/commit/eb2a85ed4dc162b2535d304799333a5a20477fd0)]:
  - effect@4.0.0-beta.6

## 4.0.0-beta.5

### Patch Changes

- Updated dependencies [[`f6e133e`](https://github.com/Effect-TS/effect-smol/commit/f6e133e9a16b32317bd09ff08c12b97a0ae44600), [`e3893cc`](https://github.com/Effect-TS/effect-smol/commit/e3893ccf2632338c7d8e745f639dcd825a9d42f8), [`a88e206`](https://github.com/Effect-TS/effect-smol/commit/a88e206e44dc66ca5a2b45bedc797877c5dbb083), [`e3893cc`](https://github.com/Effect-TS/effect-smol/commit/e3893ccf2632338c7d8e745f639dcd825a9d42f8)]:
  - effect@4.0.0-beta.5

## 4.0.0-beta.4

### Patch Changes

- Updated dependencies [[`c5a18ef`](https://github.com/Effect-TS/effect-smol/commit/c5a18ef44171e3880bf983faee74529908974b32), [`bc6b885`](https://github.com/Effect-TS/effect-smol/commit/bc6b885b94d887a200657c0775dfa874dc15bc0c)]:
  - effect@4.0.0-beta.4

## 4.0.0-beta.3

### Patch Changes

- Updated dependencies [[`3a0cf36`](https://github.com/Effect-TS/effect-smol/commit/3a0cf36eff106ba48d74e133c1598cd40613e530), [`c4da328`](https://github.com/Effect-TS/effect-smol/commit/c4da328d32fad1d61e0e538f5d371edf61521d7e)]:
  - effect@4.0.0-beta.3

## 4.0.0-beta.2

### Patch Changes

- Updated dependencies [[`a22ce73`](https://github.com/Effect-TS/effect-smol/commit/a22ce73b2bd9305b7ba665694d2255c0e6d5a8d0), [`ebdabf7`](https://github.com/Effect-TS/effect-smol/commit/ebdabf79ff4e62c8384aa8cf9a8d2787d536ee78), [`8f663bb`](https://github.com/Effect-TS/effect-smol/commit/8f663bb121021bf12bd264e8ae385187cb7a5dae)]:
  - effect@4.0.0-beta.2

## 4.0.0-beta.1

### Patch Changes

- Updated dependencies [[`0fecf70`](https://github.com/Effect-TS/effect-smol/commit/0fecf70048057623eed7c584a06671773a2b1743), [`709569e`](https://github.com/Effect-TS/effect-smol/commit/709569ed76bead9ebb0670599e4d890a07ca5a43)]:
  - effect@4.0.0-beta.1

## 4.0.0-beta.0

### Major Changes

- [#1183](https://github.com/Effect-TS/effect-smol/pull/1183) [`be642ab`](https://github.com/Effect-TS/effect-smol/commit/be642ab1b3b4cd49e53c9732d7aba1b367fddd66) Thanks @tim-smart! - v4 beta

### Patch Changes

- Updated dependencies [[`be642ab`](https://github.com/Effect-TS/effect-smol/commit/be642ab1b3b4cd49e53c9732d7aba1b367fddd66)]:
  - effect@4.0.0-beta.0
