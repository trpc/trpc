# `failed` cache event (agent)

- The `"failed"` `CacheEvent` exists for integrations (redirect handling) and fires after retries. React's `QueryClient` implements `config.onError` on it.
