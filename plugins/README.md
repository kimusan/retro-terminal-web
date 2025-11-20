# Plugin Architecture

Retro Terminal plugins live inside the `plugins/` folder and are toggled through the `plugins` section of `config.php`. Each plugin resides in its own directory and must expose a `plugin.php` bootstrap that returns an object implementing the `RetroTerminalPlugin` interface from `plugins/bootstrap.php`.

## Folder Layout

```
plugins/
├─ bootstrap.php          # shared registry + interfaces
├─ README.md              # this guide
└─ blog-bbs/
   ├─ plugin.php          # returns the plugin instance
   ├─ BlogBbsPlugin.php   # plugin implementation
   ├─ ansi/               # ANSI art assets used by the plugin
   └─ data/               # writable storage (messages, caches, etc.)
```

## Plugin Contract

```php
interface RetroTerminalPlugin {
    public function getName(): string;
    public function manifest(): array;
    public function handle(string $operation, array $params = []): array;
}
```

* `manifest()` must return metadata describing how the frontend can surface the plugin (e.g., `command`, `aliases`, `usage`, `description`).
* `handle()` is invoked from `api.php?action=plugin` with `op` (operation) and arbitrary parameters. Plugins should return JSON-serializable arrays; common keys include `lines`, `blocks`, `ansi`, `fixedWidth`, and `hangup`.

### Manifest Fields

Recommended keys returned from `manifest()`:

| Key          | Purpose                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------- |
| `name`       | Unique identifier that matches the directory name                                        |
| `command`    | Primary shell command trigger (e.g., `telnet`)                                           |
| `aliases`    | Optional alternate command triggers                                                      |
| `usage`      | One-line usage string displayed in `help` and `man`                                      |
| `description`/`help` | Longer text displayed in `help` / man pages                                      |
| `mode`       | Interaction mode. Use `'session'` for interactive flows or omit for one-shot commands.   |
| `session`    | When `mode` is `session`, supply `handshake`/`command` operation names for the backend.   |
| `nodes`      | Optional list of dial-in targets or sub-nodes shown in help output                       |

Session plugins should implement at least two operations: a `handshake` (initial screen) and a `command` handler for subsequent input. Non-session plugins can expose a single `operation` name (defaults to `command`).

## Configuring Plugins

Enable or disable plugins via `config.php`:

```php
'plugins' => [
    'blog-bbs' => [
        'enabled' => true,
        'blog_root' => __DIR__ . '/content/Blog',
    ],
],
```

Any custom keys are forwarded to the plugin constructor, so you can define feature flags, paths, or limits without editing plugin code.

## Writing New Plugins

1. Create `plugins/<name>/plugin.php` that returns an instance of your plugin class.
2. Implement `manifest()` to describe the command(s) you expose.
3. Handle the operations you expect from the frontend (`handshake`, `command`, `list`, etc.).
4. Store ANSI art or templates inside the plugin directory so site owners can customize assets without editing code.
5. Document usage inside `plugins/<name>/README.md` for future contributors.
