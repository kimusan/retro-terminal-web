<?php
// config.php
//
// Basic configuration for the Retro Terminal site.

return [
    // Path to the content root.
    // Default: "content" directory next to this file.
    'content_root' => __DIR__ . '/content',

    // Default username shown in the shell prompt.
    'shell_user'   => 'guest',

    // Default host shown in the shell prompt.
    // If null, will fall back to the HTTP hostname (domain).
    'shell_host'   => null,

    // Misc options.
    'options' => [
        // Limit for large outputs (not strictly enforced everywhere yet).
        'max_output_lines'   => 200,

        // Whether to allow ASCII/ANSI-like image rendering.
        'enable_ansi_images' => true,
    ],
];
