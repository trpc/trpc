# SSG E2E Test with Infinite

This test shows prefetching infinite queries without a transformer.

tRPC doesn't require `defaultPageParam` to be set, which can be problematic since undefined cannot be serialized which leads to invalid page params. This test should test that we don't mess this up.
