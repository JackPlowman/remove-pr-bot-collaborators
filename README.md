# Remove Pull Request Bot Collaborators

Remove Pull Request Bot Collaborators from merge commit messages.

Removes bot "Co-authored-by:" lines from GitHub merge commit messages when merging PRs (merge, squash, or rebase). Customize which patterns count as bots.

## Table of Contents

- [Remove Pull Request Bot Collaborators](#remove-pull-request-bot-collaborators)
  - [Table of Contents](#table-of-contents)
  - [Why](#why)
  - [How it works](#how-it-works)
  - [Install (load unpacked extension)](#install-load-unpacked-extension)
  - [Configure bot patterns](#configure-bot-patterns)
  - [Notes](#notes)
  - [Privacy](#privacy)
  - [Contributing](#contributing)

## Why

GitHub auto-adds `Co-authored-by:` lines from PR commits. Bots like `dependabot[bot]`, `github-actions[bot]`, `renovate[bot]`, or `snyk-bot` can clutter your merge messages. This extension removes those bot co-authors automatically while keeping human co-authors.

## How it works

- Runs as a content script on `github.com`.
- Looks for textareas whose value contains `Co-authored-by:`.
- Removes lines whose name or email matches bot patterns (customizable).
- Listens to DOM changes so it re-cleans when GitHub regenerates the message.

## Install (load unpacked extension)

1. Clone the repository or download the ZIP file.
2. Open `chrome://extensions`.
3. Enable "Developer mode".
4. Click "Load unpacked" and select the folder.
5. Optional: Open the extension's Options to customize patterns.

## Configure bot patterns

Open the extension's Options page. Each line is a JavaScript regex (no slashes), matched against:

- The co-author display name.
- The full email.
- The email local-part (before the `@`).

Defaults:

- `\[bot\]` — matches `dependabot[bot]`, `github-actions[bot]`, etc.
- `(?:^|[+\-._])bot(?:$|[+\-._])` — matches `snyk-bot`, `renovate-bot`, etc.

Examples you can add:

- `^codecov(?:-bot)?$`
- `^allcontributors(?:-bot)?$`

## Notes

- Non-bot co-authors are preserved.
- The cleaner is idempotent; it won't modify your message beyond removing bot lines and trimming trailing blank lines.
- This relies on `Co-authored-by:` lines present in the message; it won’t affect other text.

## Privacy

No network calls. Uses `chrome.storage.sync` only for your pattern settings.

## Contributing

We welcome contributions to the project. Please read the [Contributing Guidelines](docs/CONTRIBUTING.md) for more information.
