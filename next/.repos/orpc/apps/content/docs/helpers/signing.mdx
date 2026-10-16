---
title: "Signing Helpers"
description: "Cryptographically sign and verify data with HMAC-SHA256 using oRPC signing helpers, a faster alternative to encryption."
sidebar:
  label: "Signing"
---

:::info
Signing is faster than [encryption](/docs/helpers/encryption) but users can view the original data.
:::

## Basic Usage

```ts twoslash
import { getSignedValue, sign, unsign } from '@orpc/server/helpers'

const secret = 'your-secret-key'
const userData = 'user123'

const signedValue = await sign(userData, secret)
// 'user123.oneQsU0r5dvwQFHFEjjV1uOI_IR3gZfkYHij3TRauVA'
// ↑ Original data is visible to users

const verifiedValue = await unsign(signedValue, secret) // 'user123'

// Extract value without verification
const extractedValue = getSignedValue(signedValue) // 'user123'
```

:::info
The `unsign` and `getSignedValue` helpers accept `undefined` or `null` as signed value and return `undefined` for invalid inputs, enabling seamless handling of optional data.
:::
