---
title: "Encryption Helpers"
description: "Encrypt and decrypt sensitive data in oRPC using AES-GCM with PBKDF2 key derivation via the encrypt and decrypt helpers."
sidebar:
  label: "Encryption"
---

:::warning
Encryption secures data content but has performance trade-offs compared to [signing](/docs/helpers/signing). It requires more CPU resources and processing time. For edge runtimes like [Cloudflare Workers](https://developers.cloudflare.com/workers/), ensure you have sufficient CPU time budget (recommend >200ms per request) for encryption operations.
:::

## Basic Usage

```ts twoslash
import { decrypt, encrypt } from '@orpc/server/helpers'

const secret = 'your-encryption-key'
const sensitiveData = 'user-email@example.com'

const encryptedData = await encrypt(sensitiveData, secret)
// 'Rq7wF8...' (base64url encoded, unreadable)

const decryptedData = await decrypt(encryptedData, secret)
// 'user-email@example.com'
```

:::info
The `decrypt` helper accepts `undefined` or `null` as encrypted value and returns `undefined` for invalid inputs, enabling seamless handling of optional data.
:::
