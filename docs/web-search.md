# Web search

The assistant can search the web and read web pages in chats and project
chats. It is off for each user until they turn it on under
**Settings > Features > Web Search**. Tabular review and the Word add-in do not
search the web.

## How searches run

Once web search is on, users choose how each kind of model searches. The
Claude and OpenAI rows appear only when that provider is set up; the last row
covers every other model, or all models when neither is.

| Models | Choices | Default |
| --- | --- | --- |
| Claude | Anthropic Search, Brave Search, Off | Anthropic Search |
| OpenAI | OpenAI Search, Brave Search, Off | OpenAI Search |
| Other models | Brave Search, Off | Off |

- **Anthropic or OpenAI Search**: the provider runs the search and reads the
  pages. The provider bills searches to the API key in use (Anthropic charges
  per search on top of tokens).
- **Brave Search** (Mike's search): Mike calls the
  [Brave Search API](https://brave.com/search/api/) from the backend and reads
  pages itself. It works with any model and needs a Brave Search API key.
- **Off**: those models do not search.

A choice never stands in for another. If Brave Search is chosen and no key is
available, those models do not search until a key is added or the choice is
changed. The key field appears once Brave Search is chosen.

Gemini's built-in search is not offered, because Google requires its search
suggestions to be displayed wherever grounded results appear.

Mike asks the provider for at most five searches per request. An answer makes
one request per step, so a long answer can search more than five times, and
OpenAI has no per-request limit. The tool stays offered for the whole answer
because Anthropic rejects a request that drops it after earlier searches. Mike's
search is limited to eight searches per answer.

## Reading pages

Whichever search is chosen, the assistant can also open pages with Mike's
page reader, which needs no key. With Anthropic or OpenAI Search it uses the
reader for links the user gives and for search results it needs in full. The
reader fetches pages directly from this server: HTML pages are reduced to
their main content, and PDFs to their text, including PDFs a site serves as a
generic binary file. Text comes back 20,000 characters at a time, and the
assistant asks for the next part of a long page when it needs more; a page
is fetched once per answer however many parts are read. It opens at most
twelve pages per answer.

## Brave Search keys

Keys come from the same places as model API keys, chosen the same way:

1. The user's own, saved under **Settings > Features > Web Search** while web
   search is on.
2. Their organization's, saved through the organization API keys endpoint
   with provider `brave`.
3. The deployment's `BRAVE_SEARCH_API_KEY`, used for everyone without their
   own key.

Each search asks for up to ten results and is billed by Brave to whichever
key is used. Requests made with the same key are spaced a little over a
second apart, because Brave's free plan allows one request per second.

## Safety

- **Private addresses.** Pages are fetched through the same guard as MCP
  connectors: loopback, private, link-local and cloud-metadata addresses are
  refused, at every redirect.
- **Which pages the reader can open.** Only pages a search (Brave or the AI
  provider's) returned in the same answer, links to the same site on pages it
  has already read, and links in the user's latest message. Text injected
  into a document or a third-party page cannot send the assistant to an
  arbitrary address. A page on an attacker's own site can still steer which
  of its own pages the assistant reads next. Pages the AI provider's search
  opens itself are fetched on the provider's side.
- **Untrusted content.** Search results and page text are fenced as untrusted
  content, the same way document text is, and the assistant is told never to
  follow instructions found in them.
- **Confidentiality.** Queries leave the deployment: they go to the AI
  provider, or to Brave and the sites read. The assistant is instructed never
  to put client names, matter details, personal data or document text into a
  query.

With OpenAI search, OpenAI opens pages on its own servers, outside the
controls on Mike's `read_webpage`. Mike's own network cannot be reached that
way, but Mike's link allowlist and read limits do not apply to those pages.
Choose Brave Search for models where that control matters.

## Troubleshooting

- *"Web search is unavailable: no Brave Search API key is set up."* Save a key
  in Settings or set `BRAVE_SEARCH_API_KEY`.
- *"Web search is unavailable: Brave Search refused the request."* The key is
  invalid or its plan does not cover the request. A rate-limited search is
  reported as not completed instead, and the assistant may try again.
- *"Web search is unavailable for this model."* The AI provider refused its
  search tool, for example because web search is not enabled for the
  Anthropic organization or the model does not support it. The answer
  continues without searching.
- Existing deployments must apply the `user_web_search` migration from
  `backend/migrations/` before users can save the setting or a Brave Search
  key.
