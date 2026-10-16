---
title: "Request Validation Plugin"
description: "Validate requests against your contract on the client before sending them to the server, catching invalid input early."
sidebar:
  label: "Request Validation"
---

## Setup

```ts
import { RequestValidationLinkPlugin } from '@orpc/contract/plugins'

const link = new RPCLink({
  plugins: [
    new RequestValidationLinkPlugin(contract),
  ],
})
```

:::info
If you do not have a [contract](/docs/contract/router), you can use a [unlazied router](/docs/contract/router#router-to-contract) instead.
:::

:::info
The `link` can be any supported oRPC link, such as [RPCLink](/docs/rpc/link), [OpenAPILink](/docs/openapi/link), or a custom one.
:::

## Forward Validated Input

By default, the plugin does not reuse validated input for the rest of the request. Some schemas transform input in ways that can cause server-side validation to fail. If your schemas do not do that, set `forwardValidatedInput` to `true`.

```ts
const link = new RPCLink({
  plugins: [
    new RequestValidationLinkPlugin(contract, {
      forwardValidatedInput: true,
    }),
  ],
})
```

## Custom Validation Errors

If you have already [customized validation errors on the server](/docs/recipes/validation-customization#custom-validation-errors), you can use interceptors to catch and map the validation errors thrown by this plugin so they match your server-side errors.

```ts
import { ORPCError } from '@orpc/client'
import { ValidationError } from '@orpc/contract'

const link = new RPCLink({
  plugins: [
    new RequestValidationLinkPlugin(contract),
  ],
  interceptors: [
    async ({ next }) => {
      try {
        return await next()
      }
      catch (error) {
        if (
          error instanceof ORPCError
          && error.code === 'BAD_REQUEST'
          && error.cause instanceof ValidationError
        ) {
          throw new CustomInputValidationError(error.cause.issues)
        }

        throw error
      }
    }
  ]
})
```

## Form Validation

You can pair this plugin with [Form Data Helpers](/docs/helpers/form-data) to avoid heavier form validation libraries and keep your contract as the single source of truth on both the client and server.

```tsx
import { getIssueMessage, parseFormData } from '@orpc/openapi/helpers'

export function ContactForm() {
  const [error, setError] = useState()

  const handleSubmit = async (form: FormData) => {
    try {
      const output = await client.someProcedure(parseFormData(form))
      console.log(output)
    }
    catch (error) {
      setError(error)
    }
  }

  return (
    <form action={handleSubmit}>
      <input name="user[name]" type="text" />
      <span>{getIssueMessage(error, 'user[name]')}</span>

      <input name="user[emails][]" type="email" />
      <span>{getIssueMessage(error, 'user[emails][]')}</span>

      <button type="submit">Submit</button>
    </form>
  )
}
```

## Learn More

For implementation details, see the [source code](https://github.com/middleapi/orpc/blob/main/packages/contract/src/plugins/request-validation.ts).
