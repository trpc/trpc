# Agents verify with tests and preview links, not videos (human asked)

- Verify programmatically (tests, type checks, builds, `curl`). Computer use is only for UI / UX judgment that needs taste.
- No video demos or screen recordings: slow and token-heavy. The PR template's Links table deep-links the Vercel previews of the docs page and the example route instead.
- **Preview URLs come only from the Vercel bot's PR comment** (human, after a guessed `-katt` slug 404'd on #80): wait until the project's deployment is Ready, copy that Preview base URL, then append the path/anchor. Never invent a hostname (team suffix, truncation, and branch slug are not guessable). Lives in `AGENTS.md` ("Verifying changes").
