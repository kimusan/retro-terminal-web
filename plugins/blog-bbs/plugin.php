<?php
// plugins/blog-bbs/plugin.php
//
// Returns the Blog BBS plugin instance.

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/BlogBbsPlugin.php';

return new BlogBbsPlugin($configForPlugin ?? [], $contentRoot ?? (__DIR__ . '/../../content'), __DIR__);
