**Retro Terminal Website Project**

A structured implementation roadmap for the retro-themed terminal website, acting as a simulated Linux shell with read-only commands and browser-side UX.

---

## **Phase 0 – Foundations (✔ Completed)**

### ✅ Project Structure

* `/index.php` for main page
* `/api.php` for backend file interface
* `/content/` for dynamic user content (markdown files, images, folders)
* `/assets/css/terminal.css` retro green-on-black theme
* `/assets/js/terminal.js` for the terminal simulation

### ✅ Configuration

* `config.php` with:

  * `content_root` (defaults to `content/`)
  * `shell_user` (defaults to `guest`)
  * `shell_host` (defaults to site hostname)
  * ANSI image support flag

### ✅ Content Bootstrapping

* `/content/_meta/motd.md` used for dynamic MOTD at login

---

## **Phase 1 – Terminal Core (✔ Completed)**

### UI & Interaction

* Fake SSH login sequence
* Dynamic prompt: `user@host:/path$`
* Editable inline terminal input
* Blink cursor
* Auto-scroll

### Commands Implemented

* `help`
* `pwd`
* `clear`
* `ls`, `ls -l`, `ls -lh`, `ls --help`
* `cd` (with `..`, `/`, `--help`)
* `cat` (markdown, text, ANSI image rendering)
* `less` (basic version)
* Tab completion
* Command history navigation

---

## **Phase 2 – Backend Logic (✔ Completed)**

### Directory Listing

* Linux-like metadata
* Directory/file/image type classification
* Sorting rules

### File Reads

* Markdown, text, images
* Image → ASCII conversion with GD
* Path security via `realpath` containment checks

---

## **Phase 3 – Enhanced UX / Shell Simulation (⏳ In Progress)**

### Planned

* **Improve LESS** to act like real less: ✅ *Done*

  * paging UI
  * navigation (space, j/k, q)
  * fixed-height reading area
* **Terminal resizing awareness** ✅ *Done*

  * auto-adjust ASCII-art width
  * responsive wrapping

### Optional Enhancements

* Smooth typewriter effect for SSH login
* Theme variations: amber/green/CRT bloom toggle
* Fake `uname`, `whoami`, `date` commands
* “man pages” for commands (man ls → LS(1) style page)

---

## **Phase 4 – Content Authoring System (⏳ Planned)**

### Goals

* Allow new folders/files to be added manually under `/content/`
* Automatically exposed to terminal user via:

  * `ls`
  * `cd`
  * `cat`
* Markdown renderer now supports:

  * headings in bold green
  * *italic*, lists, links
  * blockquote formatting

### Future Ideas

* “virtual symlinks” via JSON metadata
* Auto-generate index.md per folder

---

## **Phase 5 – Security & Hardening (⏳ Planned)**

### Planned

* Strengthen path sanitization
* Harden GD loader for malformed images
* CSRF prevention on future interactive commands
* Lock API to read-only operations
* Add rate-limiting to ASCII image generation

---

## **Phase 6 – Deployment (🚀 Future)**

### Steps

* Production-ready `.htaccess` (if Apache) or Nginx config
* Caching headers for images and ASCII renderings
* Optional server-side cron job to pre-render ASCII versions
* Dockerfile for containerized deployment

---

## **Milestone Overview**

| Milestone | Description                           | Status |
| --------- | ------------------------------------- | ------ |
| M0        | Core project structure                | ✔      |
| M1        | Terminal UI & commands                | ✔      |
| M2        | Backend API (list/file/image)         | ✔      |
| M3        | Enhanced paging + UX                  | ⏳      |
| M4        | Content authoring system enhancements | ⏳      |
| M5        | Security hardening                    | ⏳      |
| M6        | Deployment pipeline                   | ⏳      |

---

## **Next Steps**

Here are my recommendations for what to tackle next:

### 🔥 Priority

1. **Implement full paging for LESS**
2. **Add markdown formatting (bold, list indentation, link styling)**
3. **Add CRT-style shader/filter option**
4. **Add optional command “banner” or “neofetch” style system info**

### Optional UI upgrades

* Sound effects (keystrokes, boot noise)
* Screen burn-in effect on long idle
* Cursor style options
