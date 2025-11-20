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

When `allow_messages` is true, the `LEAVE <handle> <message>` command stores sanitized notes under `plugins/blog-bbs/data/messages.json`. Handles are limited to 12 alphanumeric characters; messages truncate at 240 characters. Disable the feature by setting `allow_messages` to `false`.
