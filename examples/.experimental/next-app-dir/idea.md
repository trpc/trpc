Problem: Not hydration of `use client`-components

There's absolute **no state** shared.

When mounted in the browser

1. Gets HTML from the server that has the final state
2. Gets JS of component
3. **The JS has no data**
4. Tries to fetch <-- hits hydration boundary and gets hydration error

### Proposed solution
