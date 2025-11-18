// assets/js/terminal.js

class RetroTerminal {
    constructor(rootEl) {
        this.rootEl = rootEl;
        this.user = rootEl.dataset.shellUser || 'guest';
        this.host = rootEl.dataset.shellHost || window.location.hostname || 'localhost';
        this.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        this.defaultTheme = (rootEl.dataset.defaultTheme || 'classic').toLowerCase();

        this.currentPath = '/';
        this.history = [];
        this.historyIndex = -1;
        this.currentInputEl = null;
        this.cursorEl = null;
        this.lessState = null;
        this.charWidth = null;
        this.terminalCols = 80;

        this.apiBase = 'api.php';
        this.dirCache = {};
        this.manPages = this.getDefaultManPages();
        this.savedScrollTop = 0;
        this.savedOverflow = null;
        this.crtEnabled = false;
        this.crtPreferenceKey = 'retro-terminal-crt';
        this.bootTime = Date.now();
        this.mobileKeyboardButton = null;
        this.hiddenInput = null;

        this.init();
    }

    init() {
        this.rootEl.innerHTML = '';
        this.runFakeSSHSequence()
            .then(() => this.printMotd())
            .then(() => this.newPrompt());

        document.addEventListener('keydown', (e) => this.handleKeydown(e));
        window.addEventListener('resize', () => this.handleResize());
        this.updateTerminalMetrics();
        this.restorePreferences();
        this.setupMobileKeyboardSupport();
        this.createHiddenInput();
    }

    async runFakeSSHSequence() {
        const lines = [
            `Connecting to ${this.host}...`,
            `Authenticating as ${this.user}...`,
            `Last login: ${new Date().toString()} from 192.0.2.1`,
            ''
        ];

        for (const line of lines) {
            this.printLine(line, 'terminal-banner');
            await this.sleep(250);
        }
    }

    async printMotd() {
        const motdPath = '/_meta/motd.md';
        const url = `${this.apiBase}?action=file&path=${encodeURIComponent(motdPath)}`;

        try {
            const res = await fetch(url);
            const data = await res.json();

            if (!data.error && (data.type === 'markdown' || data.type === 'text') && data.content) {
                this.printLine(data.content);
                this.printLine('');
                return;
            }
        } catch (e) {
            console.error('MOTD fetch failed', e);
        }

        const motdLines = [
            'Welcome to the Retro Terminal.',
            '',
            'Type `help` to see available commands.',
            ''
        ];
        motdLines.forEach(l => this.printLine(l, 'terminal-dim'));
    }

    removeActiveCursor() {
        if (this.cursorEl && this.cursorEl.parentElement) {
            this.cursorEl.parentElement.removeChild(this.cursorEl);
        }
        this.cursorEl = null;
    }

    newPrompt() {
        this.removeActiveCursor();

        const lineEl = document.createElement('div');
        lineEl.className = 'terminal-line';

        const promptText = `${this.user}@${this.host}:${this.currentPath}$ `;
        const promptSpan = document.createElement('span');
        promptSpan.className = 'terminal-prompt';
        promptSpan.textContent = promptText;
        lineEl.appendChild(promptSpan);

        const inputSpan = document.createElement('span');
        inputSpan.className = 'terminal-input';
        inputSpan.contentEditable = 'true';
        inputSpan.spellcheck = false;
        inputSpan.autocapitalize = 'none';
        inputSpan.autocorrect = 'off';
        inputSpan.autocomplete = 'off';
        inputSpan.setAttribute('autocapitalize', 'none');
        inputSpan.setAttribute('autocorrect', 'off');
        inputSpan.setAttribute('autocomplete', 'off');
        inputSpan.setAttribute('inputmode', 'text');
        inputSpan.setAttribute('data-gramm', 'false');
        lineEl.appendChild(inputSpan);

        const cursorSpan = document.createElement('span');
        cursorSpan.className = 'cursor';
        lineEl.appendChild(cursorSpan);
        this.cursorEl = cursorSpan;

        this.rootEl.appendChild(lineEl);
        this.scrollToBottom();

        this.currentInputEl = inputSpan;
        this.focusInput();
        if (this.isTouchDevice) {
            setTimeout(() => this.focusInput(true), 0);
        }
    }

    focusInput(force = false) {
        if (!this.currentInputEl) return;
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(this.currentInputEl);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        if (document.activeElement !== this.currentInputEl || force) {
            try {
                this.currentInputEl.focus({ preventScroll: true });
            } catch (e) {
                this.currentInputEl.focus();
            }
        }
    }

    handleKeydown(e) {
        if (this.lessState) {
            this.handleLessKey(e);
            return;
        }

        if (!this.currentInputEl) return;

        const isAtPrompt = document.activeElement === this.currentInputEl ||
                           this.currentInputEl.contains(document.activeElement);

        if (!isAtPrompt && !e.metaKey && !e.ctrlKey) {
            this.focusInput();
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            const command = this.currentInputEl.textContent.trim();
            this.executeCommand(command);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.navigateHistory(-1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.navigateHistory(1);
        } else if (e.key === 'Tab') {
            e.preventDefault();
            this.handleTabCompletion();
        }
    }

    navigateHistory(direction) {
        if (!this.history.length) return;
        if (this.historyIndex === -1) {
            this.historyIndex = this.history.length;
        }
        this.historyIndex += direction;

        if (this.historyIndex < 0) this.historyIndex = 0;
        if (this.historyIndex >= this.history.length) {
            this.historyIndex = this.history.length;
            this.currentInputEl.textContent = '';
            this.focusInput();
            return;
        }
        this.currentInputEl.textContent = this.history[this.historyIndex];
        this.focusInput();
    }

    handleTabCompletion() {
        const text = this.currentInputEl.textContent;
        const trimmed = text.trim();
        if (!trimmed) return;

        const parts = trimmed.split(/\s+/);
        const first = parts[0];
        const commands = ['help', 'ls', 'cd', 'pwd', 'cat', 'less', 'clear', 'man', 'uname', 'whoami', 'date', 'crt', 'banner', 'figlet', 'find', 'locate'];

        if (parts.length === 1) {
            const matches = commands.filter(c => c.startsWith(first));
            if (matches.length === 1) {
                parts[0] = matches[0];
                this.currentInputEl.textContent = parts.join(' ') + ' ';
                this.focusInput();
            } else if (matches.length > 1) {
                this.printLine(matches.join('  '));
                this.newPrompt();
            }
            return;
        }

        const argToken = parts[parts.length - 1];
        const dirItems = this.dirCache[this.currentPath] || [];
        const candidates = dirItems.map(it => it.name).filter(name => name.startsWith(argToken));

        if (candidates.length === 1) {
            parts[parts.length - 1] = candidates[0];
            this.currentInputEl.textContent = parts.join(' ');
            this.focusInput();
        } else if (candidates.length > 1) {
            this.printLine(candidates.join('  '));
            this.newPrompt();
        }
    }

    executeCommand(command) {
        if (this.currentInputEl) {
            this.currentInputEl.contentEditable = 'false';
        }
        if (this.isTouchDevice) {
            this.focusHiddenInput();
        }
        this.currentInputEl = null;
        this.history.push(command);
        this.historyIndex = -1;

        if (!command) {
            this.newPrompt();
            return;
        }

        const [cmd, ...args] = command.split(/\s+/);

        let result = null;

        switch (cmd) {
            case 'help':
                result = this.cmdHelp();
                break;
            case 'clear':
                result = this.cmdClear();
                break;
            case 'pwd':
                result = this.cmdPwd();
                break;
            case 'ls':
                result = this.cmdLs(args);
                break;
            case 'cd':
                result = this.cmdCd(args);
                break;
            case 'cat':
                result = this.cmdCat(args);
                break;
            case 'less':
                result = this.cmdLess(args);
                break;
            case 'man':
                result = this.cmdMan(args);
                break;
            case 'uname':
                result = this.cmdUname(args);
                break;
            case 'whoami':
                result = this.cmdWhoami(args);
                break;
            case 'date':
                result = this.cmdDate(args);
                break;
            case 'banner':
                result = this.cmdBanner(args);
                break;
            case 'crt':
                result = this.cmdCrt(args);
                break;
            case 'figlet':
                result = this.cmdFiglet(args);
                break;
            case 'find':
                result = this.cmdFind(args);
                break;
            case 'locate':
                result = this.cmdLocate(args);
                break;
            default:
                this.printLine(`${cmd}: command not found`, 'terminal-error');
                break;
        }

        if (result && typeof result.then === 'function') {
            result.finally(() => this.newPrompt());
        } else {
            this.newPrompt();
        }
    }

    resolveVirtualPath(basePath, arg) {
        if (!arg || arg === '.') return basePath || '/';
        if (arg[0] === '/') return arg;

        let base = basePath || '/';
        if (base !== '/' && base.endsWith('/')) {
            base = base.slice(0, -1);
        }
        if (base === '/') {
            return '/' + arg;
        }
        return base + '/' + arg;
    }

    formatLsDate(epochSeconds) {
        const d = new Date(epochSeconds * 1000);
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const month = months[d.getMonth()];
        const day = String(d.getDate()).padStart(2, ' ');
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${month} ${day} ${hours}:${mins}`;
    }

    formatSize(size, humanReadable = false) {
        if (!humanReadable) {
            return String(size);
        }
        const units = ['B', 'K', 'M', 'G', 'T'];
        let n = size;
        let u = 0;
        while (n >= 1024 && u < units.length - 1) {
            n = n / 1024;
            u++;
        }
        const value = n >= 10 ? n.toFixed(0) : n.toFixed(1);
        return value + units[u];
    }

    getLsHelpText() {
        return [
            'Usage: ls [OPTION]... [FILE]',
            '',
            'List information about the FILEs (the current directory by default).',
            '',
            'Supported options:',
            '  -l            use a long listing format',
            '  -h            with -l, print sizes in human readable format',
            '  --help        display this help and exit',
            '',
            'This is a simulated ls; only a subset of options is supported.'
        ].join('\n');
    }

    getCatHelpText() {
        return [
            'Usage: cat [FILE]',
            '',
            'Concatenate FILE to standard output.',
            '',
            'Supported options:',
            '  -h, --help    display this help and exit',
            '',
            'This is a simulated cat; only read-only operations are supported.'
        ].join('\n');
    }

    getCdHelpText() {
        return [
            'Usage: cd [DIR]',
            '',
            'Change the shell working directory.',
            '',
            'Supported options:',
            '  -h, --help    display this help and exit',
            '',
            'This is a simulated cd; it only affects the virtual path.'
        ].join('\n');
    }

    getLessHelpText() {
        return [
            'Usage: less [FILE]',
            '',
            'View FILE one screenful at a time.',
            '',
            'Supported options:',
            '  -h, --help    display this help and exit',
            '',
            'Note: This simulated less may not support all real less features.'
        ].join('\n');
    }

    getManHelpText() {
        return [
            'Usage: man [COMMAND]',
            '',
            'Format and display the manual page for COMMAND.',
            '',
            'Examples:',
            '  man ls',
            '  man cat'
        ].join('\n');
    }

    getUnameHelpText() {
        return [
            'Usage: uname [-a]',
            '',
            'Print system information.',
            '',
            'Options:',
            '  -a   print all available information'
        ].join('\n');
    }

    getWhoamiHelpText() {
        return [
            'Usage: whoami',
            '',
            'Print the current effective user.'
        ].join('\n');
    }

    getDateHelpText() {
        return [
            'Usage: date',
            '',
            'Display the current date and time.'
        ].join('\n');
    }

    getBannerHelpText() {
        return [
            'Usage: banner',
            '',
            'Display a retro system info summary (neofetch style).'
        ].join('\n');
    }

    getCrtHelpText() {
        return [
            'Usage: crt [on|off|toggle|status]',
            '',
            'Toggle the CRT visual filter for the terminal.',
            '',
            'Examples:',
            '  crt on',
            '  crt off',
            '  crt toggle'
        ].join('\n');
    }

    getFindHelpText() {
        return [
            'Usage: find [PATH] PATTERN',
            '',
            'Search for files or directories starting at PATH (defaults to current directory).',
            '',
            'Examples:',
            '  find projects resume',
            '  find / images'
        ].join('\n');
    }

    getLocateHelpText() {
        return [
            'Usage: locate TERM',
            '',
            'Search the entire content tree for TERM.'
        ].join('\n');
    }

    getFigletHelpText() {
        return [
            'Usage: figlet [-f block|mini] text',
            '',
            'Render TEXT in ASCII art. Fonts supported: block (default), mini.'
        ].join('\n');
    }

    getHelpOverview() {
        return [
            'Available commands:',
            '  help          Show this help message',
            '  ls [-l] [dir] List directory contents',
            '  cd [dir]      Change directory',
            '  pwd           Print current directory',
            '  cat <file>    Show file contents',
            '  less <file>   View file with paging',
            '  man <cmd>     Show manual entry for command',
            '  uname [-a]    Display system information',
            '  whoami        Print current user',
            '  date          Display current date/time',
            '  banner        Show retro system info banner',
            '  crt [mode]    Toggle CRT visual filter',
            '  figlet <text> Render ASCII art text',
            '  find [p] pat  Search within current tree',
            '  locate term   Search entire content tree',
            '  clear         Clear the screen',
            '',
            'Most commands support -h or --help for more info.'
        ].join('\n');
    }

    cmdHelp() {
        this.printLine(this.getHelpOverview());
    }

    cmdClear() {
        this.rootEl.innerHTML = '';
        this.cursorEl = null;
    }

    cmdPwd() {
        this.printLine(this.currentPath);
    }

    cmdLs(args) {
        if (args[0] === '--help') {
            this.printLine(this.getLsHelpText());
            return;
        }

        let longFormat = false;
        let humanReadable = false;
        let targetArg = null;

        for (const arg of args) {
            if (!arg) continue;
            if (arg[0] === '-') {
                for (let i = 1; i < arg.length; i++) {
                    const ch = arg[i];
                    if (ch === 'l') longFormat = true;
                    if (ch === 'h') humanReadable = true;
                }
            } else {
                if (!targetArg) {
                    targetArg = arg;
                }
            }
        }

        const virtualPath = targetArg
            ? this.resolveVirtualPath(this.currentPath, targetArg)
            : this.currentPath;

        const url = `${this.apiBase}?action=list&path=${encodeURIComponent(virtualPath)}`;

        return fetch(url)
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    this.printLine(`ls: ${data.error}: ${virtualPath}`, 'terminal-error');
                    return;
                }

                const items = Array.isArray(data.items) ? data.items : [];

                this.dirCache[virtualPath] = items;

                if (!longFormat) {
                    const names = items
                        .sort((a, b) => {
                            if (a.type === 'dir' && b.type !== 'dir') return -1;
                            if (b.type === 'dir' && a.type !== 'dir') return 1;
                            return a.name.localeCompare(b.name);
                        })
                        .map(item => item.name);

                    const line = names.join('  ');
                    this.printLine(line);
                    return;
                }

                const sorted = items.sort((a, b) => a.name.localeCompare(b.name));
                const sizes = sorted.map(it => it.size || 0);
                const humanSizes = sizes.map(s => this.formatSize(s, humanReadable));
                const maxSizeWidth = humanSizes.reduce((m, s) => Math.max(m, s.length), 1);

                this.printLine(`total ${sorted.length}`);

                for (let i = 0; i < sorted.length; i++) {
                    const item = sorted[i];
                    const sizeStr = humanSizes[i].padStart(maxSizeWidth, ' ');

                    const isDir = item.type === 'dir';
                    const perms = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
                    const links = '1';
                    const user = this.user;
                    const group = this.user;

                    const ts = item.modified || item.created || Math.floor(Date.now() / 1000);
                    const dateStr = this.formatLsDate(ts);

                    const line = [
                        perms,
                        links.padStart(2, ' '),
                        user.padEnd(8, ' '),
                        group.padEnd(8, ' '),
                        sizeStr,
                        dateStr,
                        item.name
                    ].join('  ');

                    this.printLine(line);
                }
            })
            .catch(err => {
                console.error(err);
                this.printLine('ls: error reading directory', 'terminal-error');
            });
    }

    cmdCd(args) {
        if (args[0] === '-h' || args[0] === '--help') {
            this.printLine(this.getCdHelpText());
            return;
        }

        if (!args.length) {
            this.currentPath = '/';
            return;
        }

        const target = args[0];

        if (target === '/') {
            this.currentPath = '/';
            return;
        }

        if (target === '..') {
            if (this.currentPath !== '/') {
                const parts = this.currentPath.split('/').filter(Boolean);
                parts.pop();
                this.currentPath = '/' + parts.join('/');
                if (this.currentPath === '') this.currentPath = '/';
            }
            return;
        }

        const newPath = this.resolveVirtualPath(this.currentPath, target);
        const url = `${this.apiBase}?action=list&path=${encodeURIComponent(newPath)}`;

        return fetch(url)
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    this.printLine(`cd: ${data.error}: ${target}`, 'terminal-error');
                } else {
                    this.currentPath = newPath;
                }
            })
            .catch(err => {
                console.error(err);
                this.printLine('cd: error changing directory', 'terminal-error');
            });
    }

    cmdCat(args) {
        if (!args.length) {
            this.printLine('cat: missing file operand', 'terminal-error');
            return;
        }

        if (args[0] === '-h' || args[0] === '--help') {
            this.printLine(this.getCatHelpText());
            return;
        }

        const target = args[0];
        const virtualPath = this.resolveVirtualPath(this.currentPath, target);
        const url = `${this.apiBase}?action=file&path=${encodeURIComponent(virtualPath)}`;

        return fetch(url)
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    this.printLine(`cat: ${data.error}: ${target}`, 'terminal-error');
                    return;
                }

                if (data.type === 'markdown') {
                    return this.renderMarkdown(data.content || '', virtualPath);
                }

                if (data.type === 'text') {
                    this.printLine(data.content || '');
                } else if (data.type === 'image') {
                    const width = this.getAsciiWidth();
                    const imgUrl = `${this.apiBase}?action=image-ansi&path=${encodeURIComponent(virtualPath)}&width=${width}&color=1`;
                    return fetch(imgUrl)
                        .then(r => r.json())
                        .then(imgData => {
                            if (imgData.error || !imgData.content) {
                                this.printLine(`cat: ${imgData.error || 'failed to render image'}`, 'terminal-error');
                                return;
                            }
                            this.printAnsiArt(imgData.content);
                        })
                        .catch(err => {
                            console.error(err);
                            this.printLine('cat: error rendering image', 'terminal-error');
                        });
                } else {
                    this.printLine('[unsupported file type]');
                }
            })
            .catch(err => {
                console.error(err);
                this.printLine('cat: error reading file', 'terminal-error');
            });
    }

    cmdLess(args) {
        if (!args.length) {
            this.printLine('less: missing file operand', 'terminal-error');
            return;
        }

        if (args[0] === '-h' || args[0] === '--help') {
            this.printLine(this.getLessHelpText());
            return;
        }

        const target = args[0];
        const virtualPath = this.resolveVirtualPath(this.currentPath, target);
        const url = `${this.apiBase}?action=file&path=${encodeURIComponent(virtualPath)}`;

        return new Promise((resolve) => {
            fetch(url)
                .then(res => res.json())
                .then(data => {
                    if (data.error) {
                        this.printLine(`less: ${data.error}: ${target}`, 'terminal-error');
                        resolve();
                        return;
                    }

                    this.openLessViewer(data.content || '', virtualPath, resolve);
                })
                .catch(err => {
                    console.error(err);
                    this.printLine('less: error reading file', 'terminal-error');
                    resolve();
                });
            });
    }

    cmdMan(args) {
        if (args[0] === '-h' || args[0] === '--help') {
            this.printLine(this.getManHelpText());
            return;
        }

        if (!args.length) {
            this.printLine('What manual page do you want?');
            return;
        }

        const topic = args[0].toLowerCase();
        this.refreshManPages();
        const entry = this.manPages[topic];

        if (!entry) {
            this.printLine(`No manual entry for ${topic}`, 'terminal-error');
            return;
        }

        this.printLine(entry);
    }

    cmdUname(args) {
        if (args[0] === '-h' || args[0] === '--help') {
            this.printLine(this.getUnameHelpText());
            return;
        }

        const kernel = 'Linux';
        const nodename = this.host || 'retro-shell';
        const release = '5.15.0-retro';
        const version = '#1 SMP PREEMPT Mon Jan 1 00:00:00 UTC 1980';
        const machine = 'x86_64';
        const os = 'GNU/Linux';

        if (args.includes('-a')) {
            this.printLine(`${kernel} ${nodename} ${release} ${version} ${machine} ${os}`);
        } else {
            this.printLine(kernel);
        }
    }

    cmdWhoami(args) {
        if (args[0] === '-h' || args[0] === '--help') {
            this.printLine(this.getWhoamiHelpText());
            return;
        }
        this.printLine(this.user);
    }

    cmdDate(args) {
        if (args[0] === '-h' || args[0] === '--help') {
            this.printLine(this.getDateHelpText());
            return;
        }
        this.printLine(new Date().toString());
    }

    cmdBanner(args) {
        if (args[0] === '-h' || args[0] === '--help') {
            this.printLine(this.getBannerHelpText());
            return;
        }

        const art = [
            '      ____            _                 ',
            '     |  _ \\ ___  __ _| |_ ___  ___ ___  ',
            '     | |_) / _ \\/ _` | __/ _ \\/ __/ __| ',
            '     |  _ <  __/ (_| | ||  __/\\__ \\__ \\ ',
            '     |_| \\_\\___|\\__,_|\\__\\___||___/___/ '
        ].join('\n');

        const info = [
            ` user   : ${this.user}`,
            ` host   : ${this.host}`,
            ` kernel : Linux 5.15.0-retro`,
            ` uptime : ${this.getFakeUptime()}`,
            ` ascii  : ANSI color renderer`,
            ` theme  : ${this.crtEnabled ? 'CRT glow' : 'Classic'}`
        ].join('\n');

        this.printLine(`${art}\n\n${info}`);
    }

    cmdCrt(args) {
        const mode = (args[0] || '').toLowerCase();
        if (mode === '-h' || mode === '--help') {
            this.printLine(this.getCrtHelpText());
            return;
        }

        if (!mode || mode === 'status') {
            this.printLine(`CRT mode is currently ${this.crtEnabled ? 'enabled' : 'disabled'}.`);
            return;
        }

        if (mode === 'on') {
            this.applyCrtMode(true);
            this.printLine('CRT mode enabled.');
        } else if (mode === 'off') {
            this.applyCrtMode(false);
            this.printLine('CRT mode disabled.');
        } else if (mode === 'toggle') {
            this.applyCrtMode(!this.crtEnabled);
            this.printLine(`CRT mode ${this.crtEnabled ? 'enabled' : 'disabled'}.`);
        } else {
            this.printLine('crt: unsupported mode (use on/off/toggle/status)', 'terminal-error');
        }
    }

    cmdFiglet(args) {
        if (args[0] === '-h' || args[0] === '--help') {
            this.printLine(this.getFigletHelpText());
            return;
        }

        let font = 'block';
        const textParts = [];

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if ((arg === '-f' || arg === '--font') && args[i + 1]) {
                font = args[i + 1].toLowerCase();
                i++;
            } else {
                textParts.push(arg);
            }
        }

        const text = textParts.join(' ') || `${this.host}`;
        const output = this.renderFiglet(text, font);
        this.printLine(output, 'terminal-figlet');
    }

    cmdFind(args) {
        if (args[0] === '-h' || args[0] === '--help') {
            this.printLine(this.getFindHelpText());
            return;
        }

        if (!args.length) {
            this.printLine('find: missing pattern', 'terminal-error');
            return;
        }

        let startPath = this.currentPath;
        let patternArgs = args.slice();
        if (args.length > 1) {
            startPath = this.resolveVirtualPath(this.currentPath, args[0]);
            patternArgs = args.slice(1);
        }

        const term = patternArgs.join(' ').trim() || '';
        if (!term) {
            this.printLine('find: missing pattern', 'terminal-error');
            return;
        }

        return this.performSearch(startPath, term, 'find');
    }

    cmdLocate(args) {
        if (args[0] === '-h' || args[0] === '--help') {
            this.printLine(this.getLocateHelpText());
            return;
        }

        if (!args.length) {
            this.printLine('locate: missing search term', 'terminal-error');
            return;
        }

        const term = args.join(' ').trim();
        return this.performSearch('/', term, 'locate');
    }

    printLine(text = '', className = 'terminal-line') {
        const lineEl = document.createElement('div');
        lineEl.className = `terminal-line ${className}`;
        lineEl.textContent = text;
        this.rootEl.appendChild(lineEl);
        this.scrollToBottom();
    }

    scrollToBottom() {
        this.rootEl.scrollTop = this.rootEl.scrollHeight;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    printAnsiArt(ansiText = '') {
        const wrapper = document.createElement('div');
        wrapper.className = 'terminal-line terminal-ansi-wrapper';
        wrapper.appendChild(this.renderAnsiArt(ansiText));
        this.rootEl.appendChild(wrapper);
        this.scrollToBottom();
    }

    renderAnsiArt(ansiText = '') {
        const pre = document.createElement('pre');
        pre.className = 'terminal-ansi';
        let state = { color: null };
        let buffer = '';
        const flush = () => {
            if (!buffer) return;
            const span = document.createElement('span');
            if (state.color) {
                span.style.color = state.color;
            }
            span.textContent = buffer;
            pre.appendChild(span);
            buffer = '';
        };

        for (let i = 0; i < ansiText.length; i++) {
            const ch = ansiText[i];
            if (ch === '\u001b' && ansiText[i + 1] === '[') {
                flush();
                i += 2;
                let seq = '';
                while (i < ansiText.length && ansiText[i] !== 'm') {
                    seq += ansiText[i];
                    i++;
                }
                const parts = seq.split(';').map(part => Number(part));
                this.applyAnsiCodes(parts, state);
                continue;
            }
            buffer += ch;
        }
        flush();
        return pre;
    }

    applyAnsiCodes(codes, state) {
        if (!Array.isArray(codes) || !state) return;
        for (let i = 0; i < codes.length; i++) {
            const code = codes[i];
            if (code === 0 || Number.isNaN(code)) {
                state.color = null;
            } else if (code === 38 && codes[i + 1] === 2 && codes.length >= i + 5) {
                const r = Math.max(0, Math.min(255, codes[i + 2] || 0));
                const g = Math.max(0, Math.min(255, codes[i + 3] || 0));
                const b = Math.max(0, Math.min(255, codes[i + 4] || 0));
                state.color = `rgb(${r}, ${g}, ${b})`;
                i += 4;
            }
        }
    }

    renderMarkdown(text, virtualPath) {
        const container = document.createElement('div');
        container.className = 'terminal-line terminal-markdown';
        this.rootEl.appendChild(container);

        const lines = (text || '').split(/\r?\n/);
        const tasks = [];
        let listEl = null;
        let inCodeBlock = false;
        let codeLines = [];

        const flushList = () => {
            listEl = null;
        };

        const flushCode = () => {
            if (!codeLines.length) return;
            const pre = document.createElement('pre');
            pre.className = 'md-code';
            pre.textContent = codeLines.join('\n');
            container.appendChild(pre);
            codeLines = [];
        };

        const appendParagraph = (line) => {
            const p = document.createElement('div');
            p.className = 'md-paragraph';
            p.innerHTML = this.formatInlineMarkdown(line);
            container.appendChild(p);
        };

        lines.forEach((rawLine) => {
            const trimmed = rawLine.trim();

            if (trimmed.startsWith('```')) {
                if (inCodeBlock) {
                    flushCode();
                    inCodeBlock = false;
                } else {
                    flushList();
                    inCodeBlock = true;
                    codeLines = [];
                }
                return;
            }

            if (inCodeBlock) {
                codeLines.push(rawLine);
                return;
            }

            if (!trimmed) {
                flushList();
                container.appendChild(document.createElement('br'));
                return;
            }

            const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
            if (imageMatch) {
                flushList();
                const imageWrapper = document.createElement('div');
                imageWrapper.className = 'md-image';
                imageWrapper.textContent = `Loading ${imageMatch[1] || 'image'}...`;
                container.appendChild(imageWrapper);
                const assetPath = this.resolveMarkdownAsset(virtualPath, imageMatch[2]);
                if (assetPath) {
                    tasks.push(this.renderMarkdownImage(imageWrapper, assetPath, imageMatch[1] || 'image'));
                } else {
                    imageWrapper.textContent = 'Image reference not supported.';
                }
                return;
            }

            const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
            if (headingMatch) {
                flushList();
                const level = headingMatch[1].length;
                const heading = document.createElement('div');
                heading.className = `md-heading md-h${level}`;
                heading.innerHTML = this.formatInlineMarkdown(headingMatch[2]);
                container.appendChild(heading);
                return;
            }

            const quoteMatch = trimmed.match(/^>\s?(.*)$/);
            if (quoteMatch) {
                flushList();
                const block = document.createElement('div');
                block.className = 'md-blockquote';
                block.innerHTML = this.formatInlineMarkdown(quoteMatch[1]);
                container.appendChild(block);
                return;
            }

            const listMatch = rawLine.match(/^\s*[-*+]\s+(.*)$/);
            if (listMatch) {
                if (!listEl) {
                    listEl = document.createElement('ul');
                    listEl.className = 'md-list';
                    container.appendChild(listEl);
                }
                const li = document.createElement('li');
                li.innerHTML = this.formatInlineMarkdown(listMatch[1]);
                listEl.appendChild(li);
                return;
            }

            flushList();
            appendParagraph(trimmed);
        });

        if (inCodeBlock) {
            flushCode();
        }

        this.scrollToBottom();

        return Promise.all(tasks).then(() => {
            this.scrollToBottom();
        });
    }

    formatInlineMarkdown(text) {
        let html = this.escapeHtml(text || '');

        const codePattern = /`([^`]+)`/g;
        html = html.replace(codePattern, '<code>$1</code>');

        const boldPatterns = [
            { regex: /\*\*([^*]+)\*\*/g, replacement: '<strong>$1</strong>' },
            { regex: /__([^_]+)__/g, replacement: '<strong>$1</strong>' }
        ];
        boldPatterns.forEach(({ regex, replacement }) => {
            html = html.replace(regex, replacement);
        });

        const italicPattern = /(^|[^*])\*([^*]+)\*/g;
        html = html.replace(italicPattern, (match, prefix, value) => {
            return `${prefix}<em>${value}</em>`;
        });
        const underscorePattern = /(^|[^_])_([^_]+)_/g;
        html = html.replace(underscorePattern, (match, prefix, value) => {
            return `${prefix}<em>${value}</em>`;
        });

        html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>');

        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
            const rawUrl = (url || '').trim();
            const safeUrl = this.escapeAttribute(rawUrl);
            const safeLabel = this.escapeHtml(label);
            const external = /^https?:\/\//i.test(rawUrl);
            const target = external ? '_blank' : '_self';
            const rel = external ? ' rel="noopener"' : '';
            return `<a href="${safeUrl}" target="${target}"${rel}>${safeLabel}</a>`;
        });

        return html;
    }

    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    escapeAttribute(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;');
    }

    getDirectoryOfPath(virtualPath) {
        if (!virtualPath || virtualPath === '/') return '/';
        const parts = virtualPath.split('/').filter(Boolean);
        parts.pop();
        return '/' + parts.join('/');
    }

    resolveMarkdownAsset(markdownPath, target) {
        if (!target) return null;
        if (/^[a-z]+:\/\//i.test(target)) {
            return null;
        }
        if (target.startsWith('/')) {
            return target;
        }
        const dir = this.getDirectoryOfPath(markdownPath);
        return this.resolveVirtualPath(dir || '/', target);
    }

    renderMarkdownImage(targetEl, virtualPath, altText = '') {
        const width = this.getAsciiWidth();
        const url = `${this.apiBase}?action=image-ansi&path=${encodeURIComponent(virtualPath)}&width=${width}&color=1`;
        targetEl.textContent = `Loading ${altText || 'image'}...`;
        return fetch(url)
            .then(res => res.json())
            .then(data => {
                targetEl.innerHTML = '';
                if (data.error || !data.content) {
                    targetEl.textContent = data.error || 'Failed to render image.';
                    return;
                }
                const art = this.renderAnsiArt(data.content);
                targetEl.appendChild(art);
            })
            .catch(err => {
                console.error(err);
                targetEl.textContent = 'Failed to render image.';
            })
            .finally(() => this.scrollToBottom());
    }

    openLessViewer(text, virtualPath, onClose) {
        this.removeActiveCursor();
        this.savedScrollTop = this.rootEl.scrollTop;
        this.savedOverflow = this.rootEl.style.overflow;
        this.rootEl.style.overflow = 'hidden';
        this.rootEl.scrollTop = 0;

        const overlay = document.createElement('div');
        overlay.className = 'less-overlay';

        const header = document.createElement('div');
        header.className = 'less-header';
        header.textContent = `LESS - ${virtualPath}`;
        overlay.appendChild(header);

        const content = document.createElement('pre');
        content.className = 'less-content';
        overlay.appendChild(content);

        const status = document.createElement('div');
        status.className = 'less-status';
        overlay.appendChild(status);

        this.rootEl.appendChild(overlay);

        const lines = text.split(/\r?\n/);
        this.lessState = {
            lines,
            offset: 0,
            linesPerPage: 20,
            overlay,
            contentEl: content,
            statusEl: status,
            onClose
        };

        this.updateLessViewport();
    }

    closeLessViewer() {
        if (!this.lessState) return;
        if (this.lessState.overlay.parentElement) {
            this.lessState.overlay.parentElement.removeChild(this.lessState.overlay);
        }
        this.rootEl.style.overflow = this.savedOverflow || '';
        this.rootEl.scrollTop = this.savedScrollTop || this.rootEl.scrollHeight;
        this.savedOverflow = null;
        this.savedScrollTop = 0;

        const onClose = this.lessState.onClose;
        this.lessState = null;
        if (typeof onClose === 'function') {
            onClose();
        }
    }

    calculateLessLines() {
        if (!this.lessState) {
            return 20;
        }
        const overlay = this.lessState.overlay;
        const statusEl = this.lessState.statusEl;
        const overlayHeight = overlay.clientHeight || this.rootEl.clientHeight || 400;
        const statusHeight = statusEl.clientHeight || 0;
        const styles = window.getComputedStyle(this.rootEl);
        const lineHeight = parseFloat(styles.lineHeight) || 18;
        const available = overlayHeight - statusHeight - 16;
        return Math.max(5, Math.floor(available / lineHeight));
    }

    updateLessViewport() {
        if (!this.lessState) return;
        const state = this.lessState;
        state.linesPerPage = this.calculateLessLines();
        if (state.offset > Math.max(0, state.lines.length - state.linesPerPage)) {
            state.offset = Math.max(0, state.lines.length - state.linesPerPage);
        }
        const end = Math.min(state.offset + state.linesPerPage, state.lines.length);
        const segment = state.lines.slice(state.offset, end);
        state.contentEl.textContent = segment.join('\n');

        const progress = `${end}/${state.lines.length || 0} lines`;
        state.statusEl.textContent = end < state.lines.length
            ? `--More-- (${progress})  q to quit | space to page`
            : `(END) (${progress})  q to quit`;
    }

    handleLessKey(e) {
        if (!this.lessState) return;
        const key = e.key;
        const lower = key.length === 1 ? key.toLowerCase() : key;

        if (lower === 'q' || key === 'Escape') {
            e.preventDefault();
            this.closeLessViewer();
            return;
        }

        let delta = 0;
        const state = this.lessState;

        if (key === 'ArrowDown' || lower === 'j') {
            delta = 1;
        } else if (key === 'ArrowUp' || lower === 'k') {
            delta = -1;
        } else if (key === 'PageDown' || key === ' ') {
            delta = state.linesPerPage;
        } else if (key === 'PageUp') {
            delta = -state.linesPerPage;
        }

        if (delta !== 0) {
            e.preventDefault();
            const maxOffset = Math.max(0, state.lines.length - state.linesPerPage);
            state.offset = Math.min(maxOffset, Math.max(0, state.offset + delta));
            this.updateLessViewport();
        }
    }

    handleResize() {
        this.updateTerminalMetrics();
        if (this.lessState) {
            this.updateLessViewport();
        }
    }

    restorePreferences() {
        let saved = null;
        try {
            if (window.localStorage) {
                const value = localStorage.getItem(this.crtPreferenceKey);
                if (value === '1' || value === '0') {
                    saved = value === '1';
                }
            }
        } catch (e) {
            saved = null;
        }
        if (saved === null) {
            saved = this.defaultTheme === 'crt';
        }
        this.applyCrtMode(saved, true);
    }

    setupMobileKeyboardSupport() {
        if (!this.isTouchDevice) return;
        if (!this.mobileKeyboardButton) {
            this.createMobileKeyboardButton();
        }
        this.rootEl.addEventListener('touchend', () => {
            if (this.lessState) return;
            this.focusInput();
        }, { passive: true });
    }

    createMobileKeyboardButton() {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mobile-keyboard-button';
        button.textContent = 'Show Keyboard';
        button.addEventListener('click', (e) => {
            e.preventDefault();
            this.focusInput(true);
        });
        document.body.appendChild(button);
        this.mobileKeyboardButton = button;
    }

    createHiddenInput() {
        if (!this.isTouchDevice || this.hiddenInput) return;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'terminal-hidden-input';
        input.setAttribute('aria-hidden', 'true');
        input.tabIndex = -1;
        input.autocapitalize = 'none';
        input.autocomplete = 'off';
        input.autocorrect = 'off';
        input.spellcheck = false;
        document.body.appendChild(input);
        this.hiddenInput = input;
    }

    focusHiddenInput() {
        if (!this.hiddenInput) return;
        try {
            this.hiddenInput.focus({ preventScroll: true });
        } catch (e) {
            this.hiddenInput.focus();
        }
    }

    performSearch(startPath, term, commandName) {
        const virtualStart = startPath || '/';
        const url = `${this.apiBase}?action=search&path=${encodeURIComponent(virtualStart)}&term=${encodeURIComponent(term)}`;
        return fetch(url)
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    this.printLine(`${commandName}: ${data.error}`, 'terminal-error');
                    return;
                }
                const matches = Array.isArray(data.results) ? data.results : [];
                if (!matches.length) {
                    this.printLine(`${commandName}: no matches for "${term}"`);
                    return;
                }
                matches.forEach(item => {
                    const suffix = item.type === 'dir' ? '/' : '';
                    this.printLine(`${item.path}${suffix}`);
                });
            })
            .catch(err => {
                console.error(err);
                this.printLine(`${commandName}: search error`, 'terminal-error');
            });
    }

    renderFiglet(text, fontChoice) {
        const baseFont = this.getBaseFigletFont();
        const upper = (text || '').toUpperCase();
        const glyphs = [];
        for (const ch of upper) {
            const glyph = baseFont[ch] || baseFont['?'];
            glyphs.push(this.buildFigletGlyph(glyph, fontChoice));
        }
        if (!glyphs.length) {
            return '';
        }
        const height = glyphs[0].length;
        const lines = Array.from({ length: height }, () => '');
        glyphs.forEach(glyph => {
            for (let i = 0; i < glyph.length; i++) {
                lines[i] += glyph[i] + '  ';
            }
        });
        return lines.join('\n');
    }

    buildFigletGlyph(baseGlyph, fontChoice) {
        const font = fontChoice === 'mini' ? 'mini' : 'block';
        if (font === 'mini') {
            return baseGlyph.map(line => line.replace(/#/g, '█').replace(/\./g, ' '));
        }
        return this.scaleFigletGlyph(baseGlyph, 2, 2);
    }

    scaleFigletGlyph(lines, scaleX = 2, scaleY = 2) {
        const scaled = [];
        lines.forEach(line => {
            let expanded = '';
            for (const ch of line) {
                const fill = ch === '#';
                const symbol = fill ? '█' : ' ';
                expanded += symbol.repeat(scaleX);
            }
            for (let i = 0; i < scaleY; i++) {
                scaled.push(expanded);
            }
        });
        return scaled;
    }

    getBaseFigletFont() {
        if (this.baseFigletFont) {
            return this.baseFigletFont;
        }
        const base = {
            'A': ['..##..', '.#..#.', '#....#', '######', '#....#'],
            'B': ['###...', '#..#..', '###...', '#..#..', '###...'],
            'C': ['.####.', '#.....', '#.....', '#.....', '.####.'],
            'D': ['###...', '#..#..', '#...#.', '#..#..', '###...'],
            'E': ['#####.', '#.....', '#####.', '#.....', '#####.'],
            'F': ['#####.', '#.....', '#####.', '#.....', '#.....'],
            'G': ['.####.', '#.....', '#.###.', '#...#.', '.###..'],
            'H': ['#....#', '#....#', '######', '#....#', '#....#'],
            'I': ['.###..', '..#...', '..#...', '..#...', '.###..'],
            'J': ['..###.', '...#..', '...#..', '#..#..', '.##...'],
            'K': ['#...#.', '#..#..', '###...', '#..#..', '#...#.'],
            'L': ['#.....', '#.....', '#.....', '#.....', '#####.'],
            'M': ['#....#', '##..##', '#.##.#', '#....#', '#....#'],
            'N': ['#....#', '##...#', '#.#..#', '#..#.#', '#...##'],
            'O': ['.####.', '#....#', '#....#', '#....#', '.####.'],
            'P': ['###...', '#..#..', '###...', '#.....', '#.....'],
            'Q': ['.####.', '#....#', '#....#', '#..#.#', '.###.#'],
            'R': ['###...', '#..#..', '###...', '#..#..', '#...#.'],
            'S': ['.####.', '#.....', '.###..', '....#.', '####..'],
            'T': ['######', '..#...', '..#...', '..#...', '..#...'],
            'U': ['#....#', '#....#', '#....#', '#....#', '.####.'],
            'V': ['#....#', '#....#', '#....#', '.#..#.', '..##..'],
            'W': ['#....#', '#....#', '#.##.#', '##..##', '#....#'],
            'X': ['#....#', '.#..#.', '..##..', '.#..#.', '#....#'],
            'Y': ['#....#', '.#..#.', '..##..', '..##..', '..##..'],
            'Z': ['######', '...#..', '..#...', '.#....', '######'],
            '0': ['.####.', '#....#', '#..#.#', '#....#', '.####.'],
            '1': ['..#...', '.##...', '..#...', '..#...', '.###..'],
            '2': ['.####.', '#....#', '...##.', '..#...', '######'],
            '3': ['#####.', '....#.', '..##..', '....#.', '#####.'],
            '4': ['#...#.', '#...#.', '######', '....#.', '....#.'],
            '5': ['######', '#.....', '#####.', '....#.', '#####.'],
            '6': ['.####.', '#.....', '#####.', '#....#', '.####.'],
            '7': ['######', '....#.', '...#..', '..#...', '..#...'],
            '8': ['.####.', '#....#', '.####.', '#....#', '.####.'],
            '9': ['.####.', '#....#', '.#####', '....#.', '.###..'],
            ' ': ['......', '......', '......', '......', '......'],
            '!': ['..#...', '..#...', '..#...', '......', '..#...'],
            '?': ['.####.', '....#.', '..##..', '......', '..#...'],
            '.': ['......', '......', '......', '......', '..#...'],
            '-': ['......', '......', '.####.', '......', '......'],
            '_': ['......', '......', '......', '......', '######']
        };
        this.baseFigletFont = base;
        return base;
    }

    applyCrtMode(enabled, skipSave = false) {
        this.crtEnabled = !!enabled;
        if (document.body) {
            document.body.classList.toggle('theme-crt', this.crtEnabled);
        }
        if (!skipSave) {
            try {
                localStorage.setItem(this.crtPreferenceKey, this.crtEnabled ? '1' : '0');
            } catch (e) {
                // ignore
            }
        }
    }

    getFakeUptime() {
        const diff = Date.now() - this.bootTime;
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        return `${Math.max(hours, 0)}h ${Math.max(minutes, 0)}m`;
    }

    refreshManPages() {
        this.manPages = this.getDefaultManPages();
    }

    getDefaultManPages() {
        return {
            help: this.wrapManPage('help', 'display help for built-in commands', this.getHelpOverview()),
            ls: this.wrapManPage('ls', 'list directory contents', this.getLsHelpText()),
            cd: this.wrapManPage('cd', 'change directory', this.getCdHelpText()),
            pwd: this.wrapManPage('pwd', 'print working directory', 'Usage: pwd\n\nPrint the current working directory.'),
            cat: this.wrapManPage('cat', 'concatenate and print files', this.getCatHelpText()),
            less: this.wrapManPage('less', 'view files with paging', this.getLessHelpText()),
            clear: this.wrapManPage('clear', 'clear the terminal screen', 'Usage: clear\n\nClears all visible output from the terminal.'),
            man: this.wrapManPage('man', 'display manual pages', this.getManHelpText()),
            uname: this.wrapManPage('uname', 'print system information', this.getUnameHelpText()),
            whoami: this.wrapManPage('whoami', 'print current user name', this.getWhoamiHelpText()),
            date: this.wrapManPage('date', 'display current date and time', this.getDateHelpText()),
            banner: this.wrapManPage('banner', 'display retro system info', this.getBannerHelpText()),
            crt: this.wrapManPage('crt', 'toggle CRT visual filter', this.getCrtHelpText()),
            figlet: this.wrapManPage('figlet', 'render text in ASCII art', this.getFigletHelpText()),
            find: this.wrapManPage('find', 'search within the current tree', this.getFindHelpText()),
            locate: this.wrapManPage('locate', 'search the entire content tree', this.getLocateHelpText())
        };
    }

    wrapManPage(name, description, body) {
        return [
            `${name.toUpperCase()}(1) - ${description}`,
            '',
            body
        ].join('\n');
    }

    measureCharWidth() {
        if (this.charWidth) {
            return this.charWidth;
        }
        const measure = document.createElement('span');
        measure.className = 'terminal-measure';
        measure.textContent = 'MMMMMMMMMM';
        this.rootEl.appendChild(measure);
        const width = measure.getBoundingClientRect().width;
        this.rootEl.removeChild(measure);
        const perChar = width > 0 ? width / measure.textContent.length : 8;
        this.charWidth = perChar || 8;
        return this.charWidth;
    }

    calculateTerminalCols() {
        const width = this.rootEl.clientWidth || window.innerWidth || 800;
        const charWidth = this.measureCharWidth();
        if (!charWidth) {
            return 80;
        }
        return Math.max(40, Math.floor(width / charWidth));
    }

    updateTerminalMetrics() {
        this.charWidth = null;
        this.terminalCols = this.calculateTerminalCols();
    }

    getAsciiWidth() {
        if (!this.terminalCols) {
            this.updateTerminalMetrics();
        }
        const cols = this.terminalCols || 80;
        return Math.max(20, Math.min(200, cols - 2));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const rootEl = document.getElementById('terminal');
    if (rootEl) {
        new RetroTerminal(rootEl);
    }
});
