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

    // Default visual theme: 'classic' or 'crt'.
    'default_theme' => 'classic',

    // Misc options.
    'options' => [
        // Limit for large outputs (not strictly enforced everywhere yet).
        'max_output_lines'   => 200,

        // Whether to allow ASCII/ANSI-like image rendering.
        'enable_ansi_images' => true,

        // Explicit file whitelists.
        // List of extensions that can be listed/read (lowercase, no dots).
        'allowed_extensions' => [
            'txt','md','markdown','json','yaml','yml','ini','cfg','conf','log',
            'csv','png','jpg','jpeg','gif','webp','svg'
        ],
        'downloadable_extensions' => [
            'zip','tar','gz','tgz','bz2','xz','7z','rar','iso','img','bin','appimage'
        ],
    ],
];
