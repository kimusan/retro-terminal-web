<?php

class BlogBbsPlugin implements RetroTerminalPlugin
{
    private array $config;
    private string $contentRoot;
    private string $pluginRoot;
    private string $blogDirectory;
    private string $ansiDirectory;
    private string $messageStore;

    private const BOX_WIDTH = 66;

    public function __construct(array $config, string $contentRoot, string $pluginRoot)
    {
        $this->config = $config;
        $this->contentRoot = rtrim($contentRoot, DIRECTORY_SEPARATOR);
        $this->pluginRoot = rtrim($pluginRoot, DIRECTORY_SEPARATOR);
        $this->blogDirectory = $config['blog_root'] ?? ($this->contentRoot . DIRECTORY_SEPARATOR . 'Blog');
        $this->ansiDirectory = $this->pluginRoot . DIRECTORY_SEPARATOR . 'ansi';
        $this->messageStore = $this->pluginRoot . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'messages.json';

        $dataDir = dirname($this->messageStore);
        if (!is_dir($dataDir)) {
            @mkdir($dataDir, 0775, true);
        }
        if (!is_file($this->messageStore)) {
            @file_put_contents($this->messageStore, json_encode([], JSON_PRETTY_PRINT));
        }
    }

    public function getName(): string
    {
        return $this->config['name'] ?? 'blog-bbs';
    }

    public function manifest(): array
    {
        return [
            'name' => $this->getName(),
            'title' => 'Retro Blog BBS',
            'command' => 'telnet',
            'aliases' => ['blog', 'bbs', 'news', 'retroblog'],
            'usage' => 'telnet [blog]',
            'description' => 'Dial into the ANSI-powered blog reader.',
        ];
    }

    public function handle(string $operation, array $params = []): array
    {
        switch ($operation) {
            case 'handshake':
                return $this->buildHandshakeResponse();
            case 'command':
                return $this->handleCommand($params['input'] ?? '');
            case 'list':
                return $this->formatPostList();
            case 'read':
                return $this->formatSinglePost($params['slug'] ?? $params['id'] ?? '');
            case 'messages':
                return $this->formatMessages();
            case 'leave':
                return $this->handleLeaveMessage($params['handle'] ?? '', $params['message'] ?? '');
            default:
                return [
                    'error' => 'Unsupported plugin operation.',
                ];
        }
    }

    private function buildHandshakeResponse(): array
    {
        $ansi = array_values(array_filter([
            $this->loadAnsiArt('dialing'),
            $this->loadAnsiArt('welcome'),
        ]));

        $lines = [
            'Establishing carrier on 2400 baud link...',
            'Connected! Authenticating as guest...',
            '',
            'Welcome to RETRO BLOG BBS. Commands: LIST, READ <id|slug>, LATEST,',
            'MESSAGES, LEAVE <handle> <message>, MENU, HANGUP.',
        ];

        return [
            'ansi' => $ansi,
            'blocks' => [$this->buildMenuBlock()],
            'lines' => $lines,
            'fixedWidth' => true,
        ];
    }

    private function handleCommand(string $rawInput): array
    {
        $input = trim($rawInput);
        if ($input === '') {
            return [
                'blocks' => [$this->buildMenuBlock()],
                'fixedWidth' => true,
            ];
        }

        $parts = preg_split('/\s+/', $input, 2);
        $verb = strtoupper($parts[0] ?? '');
        $argument = trim($parts[1] ?? '');

        switch ($verb) {
            case 'HELP':
            case 'MENU':
                return [
                    'blocks' => [$this->buildMenuBlock()],
                    'fixedWidth' => true,
                ];
            case 'LIST':
            case 'POSTS':
                return $this->formatPostList();
            case 'READ':
            case 'OPEN':
                return $this->formatSinglePost($argument);
            case 'LATEST':
                return $this->formatSinglePost('1');
            case 'MSGS':
            case 'MESSAGES':
                return $this->formatMessages();
            case 'LEAVE':
            case 'MSG':
                return $this->leaveFromArgument($argument);
            case 'HANGUP':
            case 'BYE':
            case 'EXIT':
                return [
                    'lines' => ['Carrier lost. Returning to shell...'],
                    'hangup' => true,
                ];
            default:
                return [
                    'lines' => [
                        sprintf('Unknown command "%s". Type MENU for available options.', $verb ?: '?')
                    ],
                    'fixedWidth' => true,
                ];
        }
    }

    private function formatPostList(): array
    {
        $posts = $this->loadPosts();
        if (!$posts) {
            return [
                'lines' => [
                    'No blog posts were found in content/Blog.',
                    'Create markdown files or copy the provided template to get started.',
                ],
                'fixedWidth' => true,
            ];
        }

        $header = $this->formatBoxLine('RETRO BLOG WIRE', true);
        $divider = $this->boxDivider();
        $lines = [$this->boxBorder(), $header, $divider];

        $max = min(count($posts), 9);
        for ($i = 0; $i < $max; $i++) {
            $post = $posts[$i];
            $prefix = sprintf('%02d %s', $i + 1, $post['date']);
            $titleLine = $this->wrapBoxLine($prefix . '  ' . $post['title']);
            $summaryLine = $this->wrapBoxLine('    ' . $post['summary']);
            $lines[] = $titleLine;
            if ($post['summary']) {
                $lines[] = $summaryLine;
            }
            $lines[] = $divider;
        }
        $lines[] = $this->wrapBoxLine('Use READ <ID> or READ <slug> to open a story.');
        $lines[] = $this->boxBorder();

        return [
            'lines' => $lines,
            'fixedWidth' => true,
        ];
    }

    private function formatSinglePost(string $selector): array
    {
        $selector = trim($selector);
        if ($selector === '') {
            return [
                'lines' => ['Usage: READ <id|slug>'],
                'fixedWidth' => true,
            ];
        }

        $post = $this->findPost($selector);
        if (!$post) {
            return [
                'lines' => [sprintf('Unable to locate a post matching "%s".', $selector)],
                'fixedWidth' => true,
            ];
        }

        $lines = [$this->boxBorder()];
        $lines[] = $this->formatBoxLine(strtoupper($post['title']), true);
        $lines[] = $this->wrapBoxLine(sprintf('%s // %s', $post['date'], $post['slug']));
        $lines[] = $this->boxDivider();

        $bodyLines = $this->wrapText($post['body'], self::BOX_WIDTH - 4);
        foreach ($bodyLines as $bodyLine) {
            $lines[] = $this->wrapBoxLine($bodyLine);
        }

        $lines[] = $this->boxBorder();

        return [
            'lines' => $lines,
            'fixedWidth' => true,
        ];
    }

    private function formatMessages(): array
    {
        $messages = $this->getMessages();
        if (!$messages) {
            return [
                'lines' => [
                    'No messages on the board yet.',
                    'Use LEAVE <handle> <message> to post a short note.',
                ],
                'fixedWidth' => true,
            ];
        }

        $lines = [$this->boxBorder(), $this->formatBoxLine('LOBBY MESSAGES', true), $this->boxDivider()];

        $messages = array_reverse($messages);

        foreach ($messages as $message) {
            $stamp = date('M d H:i', $message['ts']);
            $header = sprintf('%s :: %s', strtoupper($message['handle']), $stamp);
            $lines[] = $this->wrapBoxLine($header);
            $wrappedMessage = $this->wrapText($message['message'], self::BOX_WIDTH - 4);
            foreach ($wrappedMessage as $msgLine) {
                $lines[] = $this->wrapBoxLine('  ' . $msgLine);
            }
            $lines[] = $this->boxDivider();
        }

        $lines[] = $this->boxBorder();

        return [
            'lines' => $lines,
            'fixedWidth' => true,
        ];
    }

    private function handleLeaveMessage(string $handle, string $message): array
    {
        if (empty($this->config['allow_messages'])) {
            return [
                'lines' => ['Message posting is disabled on this system.'],
                'fixedWidth' => true,
            ];
        }

        $handle = $this->sanitizeHandle($handle);
        $message = $this->sanitizeMessage($message);

        if ($handle === '' || $message === '') {
            return [
                'lines' => ['Usage: LEAVE <handle> <short message>'],
                'fixedWidth' => true,
            ];
        }

        $messages = $this->getMessages();
        $messages[] = [
            'handle' => $handle,
            'message' => $message,
            'ts' => time(),
        ];

        if (count($messages) > 25) {
            $messages = array_slice($messages, -25);
        }

        @file_put_contents($this->messageStore, json_encode($messages, JSON_PRETTY_PRINT));

        return [
            'lines' => ['Message saved to lobby. Use MESSAGES to review.'],
            'fixedWidth' => true,
        ];
    }

    private function leaveFromArgument(string $argument): array
    {
        $argument = trim($argument);
        if ($argument === '') {
            return [
                'lines' => ['Usage: LEAVE <handle> <message>'],
                'fixedWidth' => true,
            ];
        }

        $parts = preg_split('/\s+/', $argument, 2);
        $handle = $parts[0] ?? '';
        $message = $parts[1] ?? '';
        return $this->handleLeaveMessage($handle, $message);
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

    private function buildMenuBlock(): string
    {
        $lines = [
            $this->boxBorder(),
            $this->formatBoxLine('RETRO BLOG BBS :: MAIN MENU', true),
            $this->boxDivider(),
            $this->wrapBoxLine('LIST            Review recent posts'),
            $this->wrapBoxLine('READ <id|slug>  Read a specific entry'),
            $this->wrapBoxLine('LATEST          Jump to the most recent post'),
            $this->wrapBoxLine('MESSAGES        View lobby messages'),
            $this->wrapBoxLine('LEAVE handle msg Leave a short message'),
            $this->wrapBoxLine('MENU            Redisplay this screen'),
            $this->wrapBoxLine('HANGUP          Disconnect and return to shell'),
            $this->boxBorder(),
        ];
        return implode("\n", $lines);
    }

    private function loadAnsiArt(string $name): ?string
    {
        $path = $this->ansiDirectory . DIRECTORY_SEPARATOR . $name . '.ans';
        if (!is_file($path)) {
            return null;
        }
        return @file_get_contents($path) ?: null;
    }

    private function boxBorder(): string
    {
        return '+' . str_repeat('-', self::BOX_WIDTH - 2) . '+';
    }

    private function boxDivider(): string
    {
        return '|' . str_repeat('-', self::BOX_WIDTH - 2) . '|';
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
        return '|' . $text . '|';
    }

    private function wrapBoxLine(string $text): string
    {
        $width = self::BOX_WIDTH - 2;
        $text = $this->truncate($text, $width);
        $text = $text . str_repeat(' ', max(0, $width - strlen($text)));
        return '|' . $text . '|';
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

    private function sanitizeHandle(string $handle): string
    {
        $handle = preg_replace('/[^A-Za-z0-9_\-]/', '', $handle);
        $handle = substr($handle, 0, 12);
        return strtolower($handle);
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
