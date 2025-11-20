<?php

class BlogBbsPlugin implements RetroTerminalPlugin
{
    private array $config;
    private string $contentRoot;
    private string $pluginRoot;
    private string $blogDirectory;
    private string $ansiDirectory;
    private string $messageStore;
    private string $nodeName;
    private bool $messagesWritable;

    private const BOX_WIDTH = 66;

    public function __construct(array $config, string $contentRoot, string $pluginRoot)
    {
        $this->config = $config;
        $this->contentRoot = rtrim($contentRoot, DIRECTORY_SEPARATOR);
        $this->pluginRoot = rtrim($pluginRoot, DIRECTORY_SEPARATOR);
        $this->blogDirectory = $config['blog_root'] ?? ($this->contentRoot . DIRECTORY_SEPARATOR . 'Blog');
        $this->ansiDirectory = $this->pluginRoot . DIRECTORY_SEPARATOR . 'ansi';
        $this->messageStore = $this->pluginRoot . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'messages.json';
        $this->nodeName = strtoupper($config['node_name'] ?? 'RETRO BLOG BBS');
        $this->messagesWritable = $this->initializeMessageStore();
    }

    private function initializeMessageStore(): bool
    {
        $dataDir = dirname($this->messageStore);
        if (!is_dir($dataDir)) {
            @mkdir($dataDir, 0775, true);
        }
        if (!is_file($this->messageStore)) {
            @file_put_contents($this->messageStore, json_encode([], JSON_PRETTY_PRINT));
        }
        return is_writable($this->messageStore);
    }

    public function getName(): string
    {
        return $this->config['name'] ?? 'blog-bbs';
    }

    private function getNodeName(): string
    {
        return $this->nodeName;
    }

    public function manifest(): array
    {
        return [
            'name' => $this->getName(),
            'title' => 'Retro Blog BBS',
            'command' => 'telnet',
            'aliases' => [],
            'usage' => 'telnet [blog]',
            'description' => 'Dial into the ANSI-powered blog reader.',
            'help' => "Usage: telnet [blog]\n\nDial into the Retro Blog BBS and browse recent posts.\nUse the remote HANGUP command when you are done.",
            'mode' => 'session',
            'session' => [
                'handshake' => 'handshake',
                'command' => 'command',
                'prompt_template' => '%HANDLE%@%NODE%> ',
                'node' => $this->getNodeName(),
            ],
            'nodes' => ['blog', 'bbs', 'news', 'retroblog'],
        ];
    }

    public function handle(string $operation, array $params = []): array
    {
        $handle = $this->normalizeHandle($params['handle'] ?? null);

        switch ($operation) {
            case 'handshake':
                return $this->buildHandshakeResponse();
            case 'command':
                return $this->handleCommand($params['input'] ?? '', $handle);
            case 'list':
                return $this->wrapWithLayout([$this->buildPostListBlock()], ['handle' => $handle]);
            case 'read':
                return $this->wrapWithLayout([$this->buildSinglePostBlock($params['slug'] ?? $params['id'] ?? '')], ['handle' => $handle]);
            case 'messages':
                return $this->wrapWithLayout([$this->buildMessagesBlock()], ['handle' => $handle]);
            case 'leave':
                return $this->handleLeaveCommand($params['message'] ?? '', $handle);
            default:
                return [
                    'error' => 'Unsupported plugin operation.',
                ];
        }
    }

    private function wrapWithLayout(array $contentBlocks, array $options = []): array
    {
        $handle = $options['handle'] ?? null;
        $blocks = array_merge(
            [$this->renderStatusFrame($handle)],
            [$this->buildMenuBlock()],
            array_values(array_filter($contentBlocks))
        );

        $response = [
            'clear' => $options['clear'] ?? true,
            'fixedWidth' => true,
            'blocks' => $blocks,
            'node' => $this->getNodeName(),
        ];

        if (!empty($options['ansi'])) {
            $response['ansi'] = $options['ansi'];
        }
        if (!empty($options['lines'])) {
            $response['lines'] = $options['lines'];
        }
        if (!empty($options['requestHandle'])) {
            $response['requestHandle'] = true;
            if (!empty($options['handlePrompt'])) {
                $response['handlePrompt'] = $options['handlePrompt'];
            }
        }
        if (!empty($options['hangup'])) {
            $response['hangup'] = true;
        }

        return $response;
    }

    private function renderStatusFrame(?string $handle = null): string
    {
        $lines = [];
        $lines[] = $this->boxBorder('top');
        $lines[] = $this->formatBoxLine($this->getNodeName(), true);
        $lines[] = $this->boxBorder('divider');
        $lines[] = $this->wrapBoxLine('SYSOP: kimusan');
        $lines[] = $this->wrapBoxLine(sprintf('NODE : %s', $this->getNodeName()));
        $lines[] = $this->wrapBoxLine(sprintf('USER : %s', $handle ? strtoupper($handle) : 'LOGIN REQUIRED'));
        if (!$this->messagesWritable) {
            $lines[] = $this->boxBorder('divider');
            $lines[] = $this->wrapBoxLine('NOTICE: Message board is read-only.');
        }
        $lines[] = $this->boxBorder('bottom');
        return implode("\n", $lines);
    }

    private function buildMenuBlock(): string
    {
        $entries = [
            'LIST / POSTS    Review recent stories',
            'READ <id|slug>  Open a specific entry',
            'LATEST          Jump to the newest entry',
            'MESSAGES        View lobby messages',
            'LEAVE [@h] msg  Post a short note',
            'MENU            Reprint this screen',
            'HANGUP          Disconnect from the BBS',
        ];

        return $this->buildPanel('MAIN MENU', $entries);
    }

    private function buildIntroBlock(?string $handle = null): string
    {
        $body = [
            'Welcome to the Retro Blog BBS.',
            'Type a command from the menu to explore posts.',
            'Enter HANGUP at any time to drop the call.'
        ];
        return $this->buildPanel('SESSION INFO', $body);
    }

    private function buildPanel(string $title, array $bodyLines): string
    {
        $lines = [];
        $lines[] = $this->boxBorder('top');
        $lines[] = $this->formatBoxLine($title, true);
        if (!empty($bodyLines)) {
            $lines[] = $this->boxBorder('divider');
            foreach ($bodyLines as $line) {
                $lines[] = $this->wrapBoxLine($line);
            }
        }
        $lines[] = $this->boxBorder('bottom');
        return implode("\n", $lines);
    }

    private function buildHandshakeResponse(): array
    {
        $ansi = array_values(array_filter([
            $this->loadAnsiArt('dialing'),
            $this->loadAnsiArt('welcome'),
        ]));

        $lines = [
            'Connection established. Please enter your handle to continue.',
        ];
        if (!$this->messagesWritable) {
            $lines[] = 'NOTE: Message board is currently read-only.';
        }

        return $this->wrapWithLayout(
            [$this->buildIntroBlock(null)],
            [
                'ansi' => $ansi,
                'lines' => $lines,
                'requestHandle' => true,
                'handlePrompt' => 'Enter your handle:',
                'handle' => null,
            ]
        );
    }

    private function handleCommand(string $rawInput, string $handle): array
    {
        $input = trim($rawInput);
        if ($input === '') {
            return $this->wrapWithLayout([$this->buildIntroBlock($handle)], ['handle' => $handle]);
        }

        $parts = preg_split('/\s+/', $input, 2);
        $verb = strtoupper($parts[0] ?? '');
        $argument = trim($parts[1] ?? '');

        switch ($verb) {
            case 'HELP':
            case 'MENU':
                return $this->wrapWithLayout([$this->buildIntroBlock($handle)], ['handle' => $handle]);

            case 'LIST':
            case 'POSTS':
                return $this->wrapWithLayout([$this->buildPostListBlock()], ['handle' => $handle]);

            case 'READ':
            case 'OPEN':
                if ($argument === '') {
                    return $this->wrapWithLayout([], [
                        'handle' => $handle,
                        'lines' => ['Usage: READ <id|slug>'],
                    ]);
                }
                return $this->wrapWithLayout([$this->buildSinglePostBlock($argument)], ['handle' => $handle]);

            case 'LATEST':
                return $this->wrapWithLayout([$this->buildSinglePostBlock('1')], ['handle' => $handle]);

            case 'MSGS':
            case 'MESSAGES':
                return $this->wrapWithLayout([$this->buildMessagesBlock()], ['handle' => $handle]);

            case 'LEAVE':
            case 'MSG':
                return $this->handleLeaveCommand($argument, $handle);

            case 'HANGUP':
            case 'BYE':
            case 'EXIT':
                return [
                    'clear' => true,
                    'lines' => ['Carrier lost. Returning to shell...'],
                    'hangup' => true,
                ];

            default:
                return $this->wrapWithLayout([], [
                    'handle' => $handle,
                    'lines' => [
                        sprintf('Unknown command "%s". Type MENU for available options.', $verb ?: '?')
                    ],
                ]);
        }
    }

    private function buildPostListBlock(): string
    {
        $posts = $this->loadPosts();
        if (!$posts) {
            return $this->buildPanel('RETRO BLOG WIRE', [
                'No blog posts were found in content/Blog.',
                'Copy `_POST_TEMPLATE.md` to start publishing.',
            ]);
        }

        $lines = [
            'Use READ <ID> or READ <slug> to open a post.',
            '',
        ];

        $max = min(count($posts), 9);
        for ($i = 0; $i < $max; $i++) {
            $post = $posts[$i];
            $lines[] = sprintf('%02d [%s] %s', $i + 1, $post['date'], $post['title']);
            if ($post['summary']) {
                $summaryLines = $this->wrapText($post['summary'], self::BOX_WIDTH - 7);
                foreach ($summaryLines as $summaryLine) {
                    $lines[] = '     ' . $summaryLine;
                }
            }
            $lines[] = '';
        }

        return $this->buildPanel('RETRO BLOG WIRE', $lines);
    }

    private function buildSinglePostBlock(string $selector): string
    {
        $post = $this->findPost($selector);
        if (!$post) {
            return $this->buildPanel('STORY LOOKUP', [
                sprintf('Unable to locate a post matching "%s".', $selector ?: '?'),
            ]);
        }

        $bodyLines = [
            sprintf('%s // %s', $post['date'], $post['slug']),
            '',
        ];

        $bodyLines = array_merge($bodyLines, $this->wrapText($post['body'], self::BOX_WIDTH - 4));

        return $this->buildPanel(strtoupper($post['title']), $bodyLines);
    }

    private function buildMessagesBlock(): string
    {
        $messages = $this->getMessages();
        if (!$messages) {
            return $this->buildPanel('LOBBY MESSAGES', [
                'No one has left a note yet.',
                'Type LEAVE <message> to drop a quick line.',
            ]);
        }

        $display = [];
        $messages = array_reverse($messages);
        foreach ($messages as $message) {
            $stamp = date('M d H:i', $message['ts']);
            $display[] = sprintf('%s :: %s', strtoupper($message['handle']), $stamp);
            $wrapped = $this->wrapText($message['message'], self::BOX_WIDTH - 6);
            foreach ($wrapped as $line) {
                $display[] = '  ' . $line;
            }
            $display[] = '';
        }

        if (!$this->messagesWritable) {
            $display[] = 'Message board is currently read-only.';
        }

        return $this->buildPanel('LOBBY MESSAGES', $display);
    }

    private function handleLeaveCommand(string $argument, string $sessionHandle): array
    {
        if (empty($this->config['allow_messages'])) {
            return $this->wrapWithLayout([], [
                'handle' => $sessionHandle,
                'lines' => ['Message posting is disabled on this system.'],
            ]);
        }
        if (!$this->messagesWritable) {
            return $this->wrapWithLayout([], [
                'handle' => $sessionHandle,
                'lines' => ['Message board storage is read-only on this node.'],
            ]);
        }

        $argument = trim($argument);
        if ($argument === '') {
            return $this->wrapWithLayout([], [
                'handle' => $sessionHandle,
                'lines' => ['Usage: LEAVE <message> or LEAVE <handle> <message>'],
            ]);
        }

        [$handle, $message] = $this->extractHandleAndMessage($argument, $sessionHandle);
        $handle = $this->sanitizeHandle($handle);
        $message = $this->sanitizeMessage($message);

        if ($message === '') {
            return $this->wrapWithLayout([], [
                'handle' => $sessionHandle,
                'lines' => ['Message cannot be empty.'],
            ]);
        }

        if (!$this->saveMessageEntry($handle, $message)) {
            return $this->wrapWithLayout([], [
                'handle' => $sessionHandle,
                'lines' => ['Unable to write message to storage.'],
            ]);
        }

        return $this->wrapWithLayout([], [
            'handle' => $sessionHandle,
            'lines' => ['Message saved to lobby. Use MESSAGES to review.'],
        ]);
    }

    private function extractHandleAndMessage(string $argument, string $sessionHandle): array
    {
        if (preg_match('/^@([A-Za-z0-9_\-]{1,12})\s+(.+)$/', $argument, $match)) {
            return [$match[1], $match[2]];
        }
        return [$sessionHandle, $argument];
    }

    private function saveMessageEntry(string $handle, string $message): bool
    {
        $messages = $this->getMessages();
        $messages[] = [
            'handle' => strtoupper($handle),
            'message' => $message,
            'ts' => time(),
        ];

        if (count($messages) > 25) {
            $messages = array_slice($messages, -25);
        }

        $result = @file_put_contents($this->messageStore, json_encode($messages, JSON_PRETTY_PRINT));
        if ($result === false) {
            $this->messagesWritable = false;
            return false;
        }
        return true;
    }

    private function findPost(string $selector): ?array
    {
        $posts = $this->loadPosts();
        if (!$posts) {
            return null;
        }

        if (ctype_digit($selector)) {
            $index = (int)$selector - 1;
            return $posts[$index] ?? null;
        }

        $selector = strtolower($selector);
        foreach ($posts as $post) {
            if ($post['slug'] === $selector) {
                return $post;
            }
        }

        return null;
    }

    /**
     * @return array<int,array<string,mixed>>
     */
    private function loadPosts(): array
    {
        $dir = $this->blogDirectory;
        if (!is_dir($dir)) {
            return [];
        }

        $files = glob(rtrim($dir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . '*.md');
        if (!$files) {
            return [];
        }

        $posts = [];
        foreach ($files as $file) {
            $basename = basename($file);
            if ($basename === '' || $basename[0] === '_') {
                continue;
            }

            $raw = @file_get_contents($file);
            if ($raw === false) {
                continue;
            }

            [$frontMatter, $body] = $this->splitFrontMatter($raw);

            $title = $frontMatter['title'] ?? $this->extractHeading($body) ?? pathinfo($basename, PATHINFO_FILENAME);
            $date = $frontMatter['date'] ?? date('Y-m-d', filemtime($file) ?: time());
            $slugSource = $frontMatter['slug'] ?? $title;
            $summary = $frontMatter['summary'] ?? $this->extractSummary($body);

            $posts[] = [
                'slug' => $this->slugify($slugSource),
                'title' => trim($title),
                'date' => $date,
                'summary' => $summary,
                'body' => trim($body),
                'timestamp' => strtotime($date) ?: filemtime($file) ?: time(),
            ];
        }

        usort($posts, function ($a, $b) {
            return $b['timestamp'] <=> $a['timestamp'];
        });

        return $posts;
    }

    private function splitFrontMatter(string $raw): array
    {
        if (preg_match('/^---\s*\n(.*?)\n---\s*\n(.*)$/s', $raw, $matches)) {
            $front = $this->parseFrontMatter($matches[1]);
            return [$front, $matches[2]];
        }
        return [[], $raw];
    }

    /**
     * @return array<string,string>
     */
    private function parseFrontMatter(string $block): array
    {
        $meta = [];
        $lines = preg_split('/\r?\n/', trim($block));
        foreach ($lines as $line) {
            if (strpos($line, ':') === false) {
                continue;
            }
            [$key, $value] = explode(':', $line, 2);
            $meta[trim($key)] = trim($value);
        }
        return $meta;
    }

    private function extractHeading(string $body): ?string
    {
        if (preg_match('/^#\s*(.+)$/m', $body, $matches)) {
            return trim($matches[1]);
        }
        return null;
    }

    private function extractSummary(string $body): string
    {
        $lines = preg_split('/\r?\n/', $body);
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || strpos($line, '#') === 0) {
                continue;
            }
            $line = $this->stripMarkdown($line);
            if ($line !== '') {
                return $this->truncate($line, 60);
            }
        }
        return '';
    }

    private function stripMarkdown(string $text): string
    {
        $text = preg_replace('/`([^`]+)`/', '$1', $text);
        $text = preg_replace('/\*\*([^*]+)\*\*/', '$1', $text);
        $text = preg_replace('/\*([^*]+)\*/', '$1', $text);
        $text = preg_replace('/\[([^\]]+)\]\([^)]+\)/', '$1', $text);
        return trim($text);
    }

    private function truncate(string $text, int $max): string
    {
        $lengthFunc = function_exists('mb_strlen') ? 'mb_strlen' : 'strlen';
        $substrFunc = function_exists('mb_substr') ? 'mb_substr' : 'substr';
        if ($lengthFunc($text) <= $max) {
            return $text;
        }
        return rtrim($substrFunc($text, 0, $max - 1)) . '…';
    }

    private function slugify(string $value): string
    {
        $value = strtolower($value);
        $value = preg_replace('/[^a-z0-9]+/', '-', $value);
        $value = trim($value, '-');
        if ($value === '') {
            $value = 'post-' . dechex(time());
        }
        return $value;
    }

    private function loadAnsiArt(string $name): ?string
    {
        $path = $this->ansiDirectory . DIRECTORY_SEPARATOR . $name . '.ans';
        if (!is_file($path)) {
            return null;
        }
        return @file_get_contents($path) ?: null;
    }

    private function boxBorder(string $type = 'top'): string
    {
        $line = str_repeat('─', self::BOX_WIDTH - 2);
        switch ($type) {
            case 'bottom':
                return '└' . $line . '┘';
            case 'divider':
                return '├' . $line . '┤';
            default:
                return '┌' . $line . '┐';
        }
    }

    private function boxDivider(): string
    {
        return $this->boxBorder('divider');
    }

    private function formatBoxLine(string $text, bool $center = false): string
    {
        $width = self::BOX_WIDTH - 2;
        $text = $this->truncate($text, $width);
        if ($center) {
            $padding = max(0, $width - strlen($text));
            $left = intdiv($padding, 2);
            $right = $padding - $left;
            $text = str_repeat(' ', $left) . $text . str_repeat(' ', $right);
        } else {
            $text = $text . str_repeat(' ', max(0, $width - strlen($text)));
        }
        return '│' . $text . '│';
    }

    private function wrapBoxLine(string $text): string
    {
        $width = self::BOX_WIDTH - 2;
        $text = $this->truncate($text, $width);
        if ($text === '') {
            $text = str_repeat(' ', $width);
        } else {
            $text = $text . str_repeat(' ', max(0, $width - strlen($text)));
        }
        return '│' . $text . '│';
    }

    /**
     * @return array<int,string>
     */
    private function wrapText(string $text, int $width): array
    {
        $text = preg_replace('/\r\n?/', "\n", $text);
        $paragraphs = preg_split('/\n\s*\n/', trim($text)) ?: [];
        $lines = [];
        foreach ($paragraphs as $paragraph) {
            $paragraph = trim($paragraph);
            if ($paragraph === '') {
                continue;
            }
            $clean = $this->stripMarkdown($paragraph);
            $wrapped = wordwrap($clean, $width, "\n", true);
            $chunkLines = explode("\n", $wrapped);
            foreach ($chunkLines as $chunk) {
                $lines[] = $chunk;
            }
            $lines[] = '';
        }
        if (end($lines) === '') {
            array_pop($lines);
        }
        if (!$lines) {
            $lines[] = '(no content)';
        }
        return $lines;
    }

    /**
     * @return array<int,array<string,mixed>>
     */
    private function getMessages(): array
    {
        $raw = @file_get_contents($this->messageStore);
        if ($raw === false) {
            return [];
        }
        $messages = json_decode($raw, true);
        if (!is_array($messages)) {
            return [];
        }
        return $messages;
    }

    private function normalizeHandle(?string $handle): string
    {
        $handle = $this->sanitizeHandle((string)$handle);
        return $handle ?: 'GUEST';
    }

    private function sanitizeHandle(string $handle): string
    {
        $handle = preg_replace('/[^A-Za-z0-9_\-]/', '', $handle);
        $handle = substr($handle, 0, 12);
        return strtoupper($handle);
    }

    private function sanitizeMessage(string $message): string
    {
        $message = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $message);
        $message = trim($message);
        if (strlen($message) > 240) {
            $message = substr($message, 0, 237) . '...';
        }
        return $message;
    }
}
