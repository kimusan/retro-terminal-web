<?php
// plugins/bootstrap.php
//
// Lightweight plugin registry for the Retro Terminal.

interface RetroTerminalPlugin
{
    public function getName(): string;

    /**
     * Returns metadata describing the plugin (used for manifests).
     */
    public function manifest(): array;

    /**
     * Handles an operation requested by the frontend.
     *
     * @param string $operation
     * @param array<string,mixed> $params
     */
    public function handle(string $operation, array $params = []): array;
}

class RetroPluginRegistry
{
    /** @var array<string,RetroTerminalPlugin> */
    private array $plugins = [];

    public static function fromConfig(array $config, string $baseDir, string $contentRoot): self
    {
        $registry = new self();
        $definitions = $config['plugins'] ?? [];
        if (!$definitions || !is_array($definitions)) {
            return $registry;
        }

        $pluginsDir = rtrim($baseDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'plugins';

        foreach ($definitions as $name => $pluginConfig) {
            if (empty($pluginConfig['enabled'])) {
                continue;
            }

            $pluginPath = $pluginsDir . DIRECTORY_SEPARATOR . $name;
            $bootstrap = $pluginPath . DIRECTORY_SEPARATOR . 'plugin.php';
            if (!is_file($bootstrap)) {
                continue;
            }

            $configForPlugin = is_array($pluginConfig) ? $pluginConfig : [];
            $configForPlugin['name'] = $name;
            $plugin = self::instantiate($bootstrap, $configForPlugin, $contentRoot, $pluginPath);
            if ($plugin instanceof RetroTerminalPlugin) {
                $registry->register($plugin);
            }
        }

        return $registry;
    }

    public function register(RetroTerminalPlugin $plugin): void
    {
        $this->plugins[$plugin->getName()] = $plugin;
    }

    public function get(string $name): ?RetroTerminalPlugin
    {
        return $this->plugins[$name] ?? null;
    }

    /**
     * @return array<string,RetroTerminalPlugin>
     */
    public function all(): array
    {
        return $this->plugins;
    }

    /**
     * Returns a consumable manifest.
     *
     * @return array<int,array<string,mixed>>
     */
    public function manifest(): array
    {
        $manifest = [];
        foreach ($this->plugins as $plugin) {
            $entry = $plugin->manifest();
            if ($entry) {
                $manifest[] = $entry;
            }
        }
        return $manifest;
    }

    private static function instantiate(string $bootstrapFile, array $pluginConfig, string $contentRoot, string $pluginBasePath): ?RetroTerminalPlugin
    {
        $factory = (function () use ($bootstrapFile, $pluginConfig, $contentRoot, $pluginBasePath) {
            $configForPlugin = $pluginConfig;
            $contentRootForPlugin = $contentRoot;
            $pluginBasePathForPlugin = $pluginBasePath;
            $contentRoot = $contentRootForPlugin;
            $pluginBasePath = $pluginBasePathForPlugin;
            return require $bootstrapFile;
        })();
        if ($factory instanceof RetroTerminalPlugin) {
            return $factory;
        }

        if (is_callable($factory)) {
            $instance = $factory($pluginConfig, $contentRoot, $pluginBasePath);
            if ($instance instanceof RetroTerminalPlugin) {
                return $instance;
            }
        }

        return null;
    }
}
