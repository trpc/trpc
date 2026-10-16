# History

Accepted browser push/replace operations update the in-memory location immediately and batch native writes into a microtask. Preserve coalescing: the latest href/state wins, but any queued push wins over replaces. Use `history.flush()` when native browser state must be current; verify subsequent updates still flush afterward in `tests/createBrowserHistory.test.ts`.
