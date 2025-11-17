// assets/js/terminal.js

class RetroTerminal {
    constructor(rootEl) {
        this.rootEl = rootEl;
        this.user = rootEl.dataset.shellUser || 'guest';
        this.host = rootEl.dataset.shellHost || window.location.hostname || 'localhost';

        this.currentPath = '/';
        this.history = [];
        this.historyIndex = -1;
        this.currentInputEl = null;
        this.cursorEl = null;

        this.apiBase = 'api.php';
        this.dirCache = {};

        this.init();
    }

    init() {
        this.rootEl.innerHTML = '';
        this.runFakeSSHSequence()
            .then(() => this.printMotd())
            .then(() => this.newPrompt());

        document.addEventListener('keydown', (e) => this.handleKeydown(e));
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
        lineEl.appendChild(inputSpan);

        const cursorSpan = document.createElement('span');
        cursorSpan.className = 'cursor';
        lineEl.appendChild(cursorSpan);
        this.cursorEl = cursorSpan;

        this.rootEl.appendChild(lineEl);
        this.scrollToBottom();

        this.currentInputEl = inputSpan;
        this.focusInput();
    }

    focusInput() {
        if (!this.currentInputEl) return;
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(this.currentInputEl);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    handleKeydown(e) {
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
        const commands = ['help', 'ls', 'cd', 'pwd', 'cat', 'less', 'clear'];

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
        this.currentInputEl.contentEditable = 'false';
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

    cmdHelp() {
        const text = [
            'Available commands:',
            '  help          Show this help message',
            '  ls [-l] [dir] List directory contents',
            '  cd [dir]      Change directory',
            '  pwd           Print current directory',
            '  cat <file>    Show file contents',
            '  less <file>   View file with paging (COMING SOON)',
            '  clear         Clear the screen',
            '',
            'Most commands support -h or --help for more info.'
        ].join('\n');
        this.printLine(text);
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

                if (data.type === 'markdown' || data.type === 'text') {
                    this.printLine(data.content || '');
                } else if (data.type === 'image') {
                    const width = 80;
                    const imgUrl = `${this.apiBase}?action=image-ansi&path=${encodeURIComponent(virtualPath)}&width=${width}`;
                    return fetch(imgUrl)
                        .then(r => r.json())
                        .then(imgData => {
                            if (imgData.error) {
                                this.printLine(`cat: ${imgData.error}`, 'terminal-error');
                                return;
                            }
                            this.printLine(imgData.content || '');
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

        return fetch(url)
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    this.printLine(`less: ${data.error}: ${target}`, 'terminal-error');
                    return;
                }

                this.printLine(data.content || '');
                this.printLine('[end of file – paging UI coming soon]');
            })
            .catch(err => {
                console.error(err);
                this.printLine('less: error reading file', 'terminal-error');
            });
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
}

document.addEventListener('DOMContentLoaded', () => {
    const rootEl = document.getElementById('terminal');
    if (rootEl) {
        new RetroTerminal(rootEl);
    }
});
