<?php
// index.php
//
// Main entry point that renders the retro terminal container.

$config = require __DIR__ . '/config.php';

$shellUser = $config['shell_user'] ?? 'guest';
$shellHost = $config['shell_host'] ?? null;

if (!$shellHost) {
    $shellHost = $_SERVER['HTTP_HOST'] ?? 'localhost';
}
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Retro Terminal</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <link rel="stylesheet" href="assets/css/terminal.css">
</head>
<body>
<noscript>
<div style="color:#0f0; background:#000; padding:1rem; font-family:monospace;">
    This site is a simulated terminal and requires JavaScript to run.
</div>
</noscript>

<div id="terminal"
     data-shell-user="<?= htmlspecialchars($shellUser, ENT_QUOTES) ?>"
     data-shell-host="<?= htmlspecialchars($shellHost, ENT_QUOTES) ?>">
</div>

<script src="assets/js/terminal.js"></script>
</body>
</html>
