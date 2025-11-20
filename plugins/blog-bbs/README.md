# Retro Blog BBS Plugin

This plugin ships the ANSI-style blog reader that powers the `telnet` command. It scans markdown posts inside `content/Blog/`, renders them inside a fixed-width BBS UI, and optionally stores short lobby messages.

## Configuration

`config.php`:

```php
'plugins' => [
    'blog-bbs' => [
        'enabled' => true,
        'blog_root' => __DIR__ . '/content/Blog',
        'allow_messages' => true,
    ],
],
```

`blog_root` can point to any folder containing `.md` posts. Files prefixed with `_` are ignored.

The plugin registers the `telnet` command and advertises the dial targets listed under `nodes` inside `BlogBbsPlugin::manifest()`. Rename or add nodes there if you want custom prompts (e.g., `retro`, `bbs`, `news`).

## ANSI Artwork

Custom artwork is stored under `plugins/blog-bbs/ansi/`:

* `dialing.ans` — displayed while the fake modem dials.
* `welcome.ans` — shown after the handshake succeeds.

Edit or replace these files with your own ANSI sequences; they are read verbatim, so you can use 16-color or true-color escapes.

## Usage

1. Run `telnet blog` from the terminal. The connection animation plays before the ANSI UI appears.
2. When prompted, enter a handle. The on-screen prompt switches to `HANDLE@NODE>`, making it obvious that you are inside the BBS rather than the regular shell.
3. Available commands: `LIST`, `READ <id|slug>`, `LATEST`, `MESSAGES`, `LEAVE <message>` (or `LEAVE @handle <message>`), `MENU`, and `HANGUP`.
4. Every command clears the screen and reprints the welcome frame and menu before showing the command output, keeping the UI consistent across screen sizes.
5. Prefix a message with `@handle` if you want to sign it differently from your logged-in handle (`LEAVE @guest Thanks for stopping by!`).

The lobby message board stores entries inside `plugins/blog-bbs/data/messages.json`. If that file (or directory) is not writable, the UI automatically switches to read-only mode and surfaces a warning to the user.

## Blog Metadata

Each post supports a lightweight YAML front matter block:

```markdown
---
title: My Retro Post
date: 2024-01-15
summary: Two-line summary shown in LIST.
slug: retro-post
---
Content starts here in Markdown.
```

`title`, `date`, and `summary` fall back to filename, mtime, and the first non-heading line when omitted.

## Lobby Messages

When `allow_messages` is true, the `LEAVE <message>` command stores sanitized notes under `plugins/blog-bbs/data/messages.json`. Prefix the text with `@handle` if you want to post under a different alias than your logged-in handle. Handles are limited to 12 alphanumeric characters; messages truncate at 240 characters. Disable the feature by setting `allow_messages` to `false`.
