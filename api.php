<?php
// api.php
//
// JSON API for the Retro Terminal.

header('Content-Type: application/json; charset=utf-8');

$config = require __DIR__ . '/config.php';
require_once __DIR__ . '/plugins/bootstrap.php';
$options = $config['options'] ?? [];
$allowedExtensions = array_map('strtolower', $options['allowed_extensions'] ?? []);
$downloadableExtensions = array_map('strtolower', $options['downloadable_extensions'] ?? []);

function respond($data, int $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

$contentRoot = realpath($config['content_root'] ?? (__DIR__ . '/content'));
if ($contentRoot === false) {
    respond(['error' => 'Content root not found.'], 500);
}
$pluginRegistry = RetroPluginRegistry::fromConfig($config, __DIR__, $contentRoot);

function resolve_path(string $virtualPath, string $contentRoot): ?string
{
    $virtualPath = trim($virtualPath);
    if ($virtualPath === '' || $virtualPath[0] !== '/') {
        $virtualPath = '/' . ltrim($virtualPath, '/');
    }

    $relative = ltrim($virtualPath, '/');
    $candidate = $contentRoot . DIRECTORY_SEPARATOR . $relative;
    $real = realpath($candidate);

    if ($real === false) {
        return null;
    }

    if (strpos($real, $contentRoot) !== 0) {
        return null;
    }

    return $real;
}

function load_image_resource(string $path)
{
    $info = @getimagesize($path);
    if ($info === false) {
        return null;
    }

    $mime = $info['mime'] ?? '';
    switch ($mime) {
        case 'image/png':
            return @imagecreatefrompng($path);
        case 'image/jpeg':
            return @imagecreatefromjpeg($path);
        case 'image/gif':
            return @imagecreatefromgif($path);
        case 'image/webp':
            if (function_exists('imagecreatefromwebp')) {
                return @imagecreatefromwebp($path);
            }
            return null;
        default:
            return null;
    }
}

function image_to_ascii(string $path, int $targetWidth = 80, bool $withColor = false): ?string
{
    $im = load_image_resource($path);
    if (!$im) {
        return null;
    }

    $srcW = imagesx($im);
    $srcH = imagesy($im);

    if ($srcW <= 0 || $srcH <= 0) {
        imagedestroy($im);
        return null;
    }

    $targetWidth = max(10, min($targetWidth, 200));
    $scale = $targetWidth / $srcW;
    $targetHeight = (int)round($srcH * $scale * 0.5);
    if ($targetHeight < 5) {
        $targetHeight = 5;
    }

    $chars = '@%#*+=-:. ';
    $charLen = strlen($chars) - 1;

    $lines = [];
    $resetSeq = "\033[0m";

    for ($y = 0; $y < $targetHeight; $y++) {
        $row = '';
        $srcY = (int)($y * $srcH / $targetHeight);
        for ($x = 0; $x < $targetWidth; $x++) {
            $srcX = (int)($x * $srcW / $targetWidth);
            $rgb = imagecolorat($im, $srcX, $srcY);
            $r = ($rgb >> 16) & 0xFF;
            $g = ($rgb >> 8) & 0xFF;
            $b = $rgb & 0xFF;

            $lum = 0.299 * $r + 0.587 * $g + 0.114 * $b;
            $idx = (int)round(($lum / 255) * $charLen);
            if ($idx < 0) $idx = 0;
            if ($idx > $charLen) $idx = $charLen;

            $char = $chars[$idx];
            if ($withColor) {
                $row .= sprintf("\033[38;2;%d;%d;%dm%s", $r, $g, $b, $char);
            } else {
                $row .= $char;
            }
        }
        if ($withColor) {
            $row .= $resetSeq;
        }
        $lines[] = $row;
    }

    imagedestroy($im);

    return implode("\n", $lines);
}

function is_extension_allowed(?string $ext, array $allowed): bool {
    if ($ext === null || $ext === '') {
        return true;
    }
    if (!$allowed) {
        return true;
    }
    return in_array(strtolower($ext), $allowed, true);
}

function is_extension_visible(?string $ext, array $allowed, array $downloadable): bool {
    if ($ext === null || $ext === '') {
        return true;
    }
    $ext = strtolower($ext);
    if ($allowed && in_array($ext, $allowed, true)) {
        return true;
    }
    if ($downloadable && in_array($ext, $downloadable, true)) {
        return true;
    }
    if (!$allowed && !$downloadable) {
        return true;
    }
    return false;
}

function is_downloadable_extension(?string $ext, array $downloadable): bool {
    if ($ext === null) {
        return false;
    }
    if (!$downloadable) {
        return false;
    }
    return in_array(strtolower($ext), $downloadable, true);
}

$action = $_GET['action'] ?? $_POST['action'] ?? null;

switch ($action) {
    case 'list':
        $virtualPath = $_GET['path'] ?? '/';
        $realPath = resolve_path($virtualPath, $contentRoot);
        if (!$realPath || !is_dir($realPath)) {
            respond(['error' => 'Directory not found', 'path' => $virtualPath], 404);
        }

        $items = [];
        $dir = new DirectoryIterator($realPath);
        foreach ($dir as $fileinfo) {
            if ($fileinfo->isDot()) continue;

            $type = $fileinfo->isDir() ? 'dir' : 'file';
            $name = $fileinfo->getFilename();
            $ext  = strtolower(pathinfo($name, PATHINFO_EXTENSION));

            if ($name === '_meta') {
                continue;
            }

            if (!$fileinfo->isDir() && !is_extension_visible($ext, $allowedExtensions, $downloadableExtensions)) {
                continue;
            }

            if (in_array($ext, ['png', 'jpg', 'jpeg', 'gif', 'webp'], true)) {
                $type = 'image';
            }

            $items[] = [
                'name'     => $name,
                'type'     => $type,
                'size'     => $fileinfo->getSize(),
                'created'  => $fileinfo->getCTime(),
                'modified' => $fileinfo->getMTime(),
            ];
        }

        respond([
            'path'  => $virtualPath,
            'items' => $items,
        ]);
        break;

    case 'file':
        $virtualPath = $_GET['path'] ?? '';
        $realPath = resolve_path($virtualPath, $contentRoot);
        if (!$realPath || !is_file($realPath)) {
            respond(['error' => 'File not found', 'path' => $virtualPath], 404);
        }

        $ext = strtolower(pathinfo($realPath, PATHINFO_EXTENSION));

        if (!is_extension_allowed($ext, $allowedExtensions)) {
            respond(['error' => 'Access denied'], 403);
        }

        if ($ext === 'md') {
            $content = file_get_contents($realPath);
            respond([
                'path'     => $virtualPath,
                'type'     => 'markdown',
                'created'  => filectime($realPath),
                'modified' => filemtime($realPath),
                'content'  => $content,
            ]);
        } elseif (in_array($ext, ['png', 'jpg', 'jpeg', 'gif', 'webp'], true)) {
            respond([
                'path'     => $virtualPath,
                'type'     => 'image',
                'created'  => filectime($realPath),
                'modified' => filemtime($realPath),
            ]);
        } else {
            $content = file_get_contents($realPath);
            respond([
                'path'     => $virtualPath,
                'type'     => 'text',
                'created'  => filectime($realPath),
                'modified' => filemtime($realPath),
                'content'  => $content,
            ]);
        }
        break;

    case 'image-ansi':
        $virtualPath = $_GET['path'] ?? '';
        $width       = isset($_GET['width']) ? (int)$_GET['width'] : 80;
        $withColor   = isset($_GET['color']) && $_GET['color'] !== '0';

        $realPath = resolve_path($virtualPath, $contentRoot);
        if (!$realPath || !is_file($realPath)) {
            respond(['error' => 'File not found', 'path' => $virtualPath], 404);
        }

        $ext = strtolower(pathinfo($realPath, PATHINFO_EXTENSION));
        if (!in_array($ext, ['png', 'jpg', 'jpeg', 'gif', 'webp'], true)) {
            respond(['error' => 'Unsupported image type', 'path' => $virtualPath], 400);
        }
        if (!is_extension_allowed($ext, $allowedExtensions)) {
            respond(['error' => 'Access denied'], 403);
        }

        $ascii = image_to_ascii($realPath, $width, $withColor);
        if ($ascii === null) {
            respond(['error' => 'Failed to convert image'], 500);
        }

        respond([
            'path'    => $virtualPath,
            'type'    => 'image-ascii',
            'content' => $ascii,
        ]);
        break;

    case 'search':
        $term = trim($_GET['term'] ?? '');
        if ($term === '') {
            respond(['error' => 'Missing search term'], 400);
        }

        $startVirtual = $_GET['path'] ?? '/';
        $startReal = resolve_path($startVirtual, $contentRoot);
        if (!$startReal || !is_dir($startReal)) {
            respond(['error' => 'Invalid start path', 'path' => $startVirtual], 400);
        }

        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 200;
        $limit = max(1, min($limit, 500));
        $lcTerm = strtolower($term);
        $results = [];

        $directoryIterator = new RecursiveDirectoryIterator($startReal, FilesystemIterator::SKIP_DOTS);
        $filter = new RecursiveCallbackFilterIterator($directoryIterator, function ($current) use ($allowedExtensions, $downloadableExtensions) {
            if ($current->isDir()) {
                return $current->getFilename() !== '_meta';
            }
            $ext = strtolower(pathinfo($current->getFilename(), PATHINFO_EXTENSION));
            return is_extension_visible($ext, $allowedExtensions, $downloadableExtensions);
        });
        $iterator = new RecursiveIteratorIterator($filter, RecursiveIteratorIterator::SELF_FIRST);

        foreach ($iterator as $fileinfo) {
            if (count($results) >= $limit) {
                break;
            }
            $fullPath = $fileinfo->getPathname();
            $relative = substr($fullPath, strlen($contentRoot));
            $relative = str_replace(DIRECTORY_SEPARATOR, '/', $relative);
            $virtual = '/' . ltrim($relative, '/');
            $nameLower = strtolower($fileinfo->getFilename());
            $pathLower = strtolower($virtual);

            if (strpos($nameLower, $lcTerm) === false && strpos($pathLower, $lcTerm) === false) {
                continue;
            }

            $type = $fileinfo->isDir() ? 'dir' : 'file';
            $ext  = strtolower(pathinfo($fileinfo->getFilename(), PATHINFO_EXTENSION));

            if (!$fileinfo->isDir() && !is_extension_allowed($ext, $allowedExtensions)) {
                continue;
            }
            if (in_array($ext, ['png', 'jpg', 'jpeg', 'gif', 'webp'], true)) {
                $type = 'image';
            }

            $results[] = [
                'path' => $virtual,
                'name' => $fileinfo->getFilename(),
                'type' => $type,
            ];
        }

        respond([
            'path'    => $startVirtual,
            'term'    => $term,
            'results' => $results,
        ]);
        break;

    case 'grep':
        $term = $_GET['term'] ?? '';
        if ($term === '') {
            respond(['error' => 'Missing search term'], 400);
        }
        $startVirtual = $_GET['path'] ?? '/';
        $startReal = resolve_path($startVirtual, $contentRoot);
        if (!$startReal || (!is_dir($startReal) && !is_file($startReal))) {
            respond(['error' => 'Invalid start path', 'path' => $startVirtual], 400);
        }

        $recursive = !empty($_GET['recursive']);
        $namesOnly = !empty($_GET['names_only']);
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 200;
        $limit = max(1, min($limit, 1000));
        $termLen = strlen($term);

        $textExtensions = ['txt','md','json','js','ts','tsx','jsx','css','scss','sass','html','htm','xml','yml','yaml','ini','cfg','conf','log','php','py','rb'];

        $results = [];
        $processed = 0;

        $iterable = [];
        if (is_file($startReal)) {
            $ext = strtolower(pathinfo($startReal, PATHINFO_EXTENSION));
            if (!is_extension_allowed($ext, $allowedExtensions)) {
                respond(['error' => 'Access denied'], 403);
            }
            $iterable[] = $startReal;
        } else {
            if ($recursive) {
                $directoryIterator = new RecursiveDirectoryIterator($startReal, FilesystemIterator::SKIP_DOTS);
                $filter = new RecursiveCallbackFilterIterator($directoryIterator, function ($current) use ($allowedExtensions, $downloadableExtensions) {
                    if ($current->isDir()) {
                        return $current->getFilename() !== '_meta';
                    }
                    $ext = strtolower(pathinfo($current->getFilename(), PATHINFO_EXTENSION));
                    return is_extension_visible($ext, $allowedExtensions, $downloadableExtensions);
                });
                $iterator = new RecursiveIteratorIterator($filter, RecursiveIteratorIterator::SELF_FIRST);
                foreach ($iterator as $fileinfo) {
                    if ($fileinfo->isFile()) {
                        $iterable[] = $fileinfo->getPathname();
                    }
                }
            } else {
                $dir = new DirectoryIterator($startReal);
                foreach ($dir as $fileinfo) {
                    if ($fileinfo->isDot()) continue;
                    if ($fileinfo->isDir()) continue;
                    if ($fileinfo->getFilename() === '_meta') continue;
                    $ext = strtolower(pathinfo($fileinfo->getFilename(), PATHINFO_EXTENSION));
                    if (!is_extension_visible($ext, $allowedExtensions, $downloadableExtensions)) continue;
                    $iterable[] = $fileinfo->getPathname();
                }
            }
        }

        foreach ($iterable as $filePath) {
            if ($processed >= $limit) {
                break;
            }
            $relative = substr($filePath, strlen($contentRoot));
            $relative = str_replace(DIRECTORY_SEPARATOR, '/', $relative);
            $virtual = '/' . ltrim($relative, '/');

            if (strpos($virtual, '/_meta/') !== false) {
                continue;
            }

            $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
            if ($ext && !in_array($ext, $textExtensions, true)) {
                continue;
            }
            if (!is_extension_allowed($ext, $allowedExtensions)) {
                continue;
            }

            $content = @file($filePath, FILE_IGNORE_NEW_LINES);
            if ($content === false) {
                continue;
            }

            $matches = [];
            foreach ($content as $idx => $line) {
                if (strpos($line, $term) !== false) {
                    if ($namesOnly) {
                        $matches = true;
                        break;
                    }
                    $snippet = $line;
                    if (strlen($snippet) > 200) {
                        $snippet = substr($snippet, 0, 200) . '...';
                    }
                    $matches[] = [
                        'line' => $idx + 1,
                        'text' => $snippet
                    ];
                }
            }

            if ($matches) {
                $results[] = [
                    'path'    => $virtual,
                    'matches' => $namesOnly ? [] : $matches,
                ];
                $processed++;
            }
        }

        respond([
            'path'    => $startVirtual,
            'term'    => $term,
            'results' => $results,
            'names_only' => $namesOnly ? 1 : 0,
        ]);
        break;

    case 'plugins':
        respond(['plugins' => $pluginRegistry->manifest()]);
        break;

    case 'plugin':
        $pluginName = $_GET['plugin'] ?? $_POST['plugin'] ?? '';
        if (!$pluginName) {
            respond(['error' => 'Missing plugin identifier'], 400);
        }
        $plugin = $pluginRegistry->get($pluginName);
        if (!$plugin) {
            respond(['error' => 'Plugin not available'], 404);
        }

        $operation = $_GET['op'] ?? $_POST['op'] ?? 'command';
        $params = $_REQUEST;
        unset($params['action'], $params['plugin'], $params['op']);

        try {
            $result = $plugin->handle($operation, $params);
            respond($result);
        } catch (\Throwable $e) {
            respond(['error' => 'Plugin error'], 500);
        }
        break;

    case 'download':
        $virtualPath = $_GET['path'] ?? '';
        $checkOnly   = isset($_GET['check']);

        $realPath = resolve_path($virtualPath, $contentRoot);
        if (!$realPath || !is_file($realPath)) {
            if ($checkOnly) {
                respond(['error' => 'File not found'], 404);
            }
            respond(['error' => 'File not found', 'path' => $virtualPath], 404);
        }

        $ext = strtolower(pathinfo($realPath, PATHINFO_EXTENSION));
        if (!is_downloadable_extension($ext, $downloadableExtensions)) {
            if ($checkOnly) {
                respond(['error' => 'Download not allowed for this file'], 403);
            }
            respond(['error' => 'Download not allowed'], 403);
        }

        if ($checkOnly) {
            respond(['ok' => true, 'path' => $virtualPath]);
        }

        $filename = basename($realPath);
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . addslashes($filename) . '"');
        header('Content-Length: ' . filesize($realPath));
        readfile($realPath);
        exit;

    default:
        respond(['error' => 'Unknown or missing action'], 400);
}
