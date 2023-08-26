---
'@trpc/server': patch
---

Fixed a bug where the context could be empty in `errorFormatter` and `onError` functions when the requested endpoint url contained invalid JSON data.
