### *How to Manage Content for the Retro Terminal Website*

This document explains how to structure and maintain all content displayed inside the simulated terminal environment.
The goal is to allow you to **add, remove, rename, and organize content** simply by manipulating text files and folders—no coding required.

---

## **📁 Folder Structure Overview**

The content system is entirely filesystem-driven.
Everything the “terminal” user can see lives inside the `content/` directory:

```
content/
├─ _meta/
│  └─ motd.md
├─ About/
│  ├─ About.md
│  └─ pic1.png
├─ Projects/
│  ├─ Code-project-linux.md
│  ├─ project2.md
│  └─ screenshot.png
└─ Blog/
   ├─ article1.md
   ├─ article2.md
   └─ header.png
```

### What it affects:

| Filesystem Element                   | Terminal Output                     |
| ------------------------------------ | ----------------------------------- |
| Directory                            | Appears when user runs `ls`         |
| Markdown `.md` file                  | Can be displayed with `cat`, `less` |
| Images (`png`, `jpg`, `gif`, `webp`) | Rendered as ASCII art via `cat`     |
| Any other file type                  | Displayed as raw text               |

---

## **📄 Special Directories**

### ### `_meta/`

This folder holds terminal-specific data files.

#### **`motd.md`**

Displayed automatically after the simulated SSH login sequence.

* Supports markdown or plain text.
* Newlines are preserved.
* You can include ASCII art if you like.

Example:

```
Welcome to the Retro Terminal!
This site is completely filesystem-driven.
Type 'help' to get started.
```

---

## **📁 Creating New Sections**

Want a new “folder” the user can `cd` into?
Just create a directory inside `content/`.

Example:

```
mkdir content/Gallery
```

Terminal view:

```
$ ls
About  Projects  Gallery
```

The terminal reflects the filesystem automatically.

---

## **📄 Adding Markdown Content**

Create `.md` files inside any folder:

```
content/Projects/New-Tool.md
content/About/Bio.md
content/Blog/Personal-Note.md
```

The user can:

```
$ cd Projects
$ ls
New-Tool.md  Code-project-linux.md
$ cat New-Tool.md
```

Markdown is displayed as plain text unless you want me to add inline formatting later.

---

## **🖼 Adding Image Files**

Images with extensions:

* `.png`
* `.jpg`, `.jpeg`
* `.gif`
* `.webp`

…are recognized and rendered as ASCII art:

```
$ cat screenshot.png
@@@@@@@@@%%%%###***++=---
  ...
```

### Tips for best results:

* Prefer **PNG** for crisp ASCII output.
* Keep images reasonably sized; very large files may look messy in a narrow terminal.
* Transparent PNGs will appear with black background.

---

## **🔒 Security Considerations**

All filesystem access is sandboxed:

* No files outside `/content/` can be accessed.
* `realpath()` prevents directory traversal (`../../etc/passwd` won’t work).
* Only read-only access is allowed.

---

## **📦 Adding Rich Content Structures**

The terminal supports natural nesting:

```
content/
└─ Portfolio/
   ├─ Games/
   │  └─ DoomClone.md
   ├─ Hardware/
   │  └─ keyboard-build-log.md
   └─ Software/
      └─ retro-terminal.md
```

The user can:

```
cd Portfolio/Software
ls
cat retro-terminal.md
```

There is no limit to nesting depth.

---

## **📁 Deleting or Hiding Content**

If you delete a file or directory:

* It instantly disappears from the terminal view.
* No caching issues—the frontend always fetches live data from `/api.php`.

To temporarily hide something, rename it so it **doesn’t** end in `.md` or image extensions.

---

## **📄 Naming Rules**

* Use any characters allowed by your OS.
* Terminal will show filenames exactly as-is.
* Avoid names with spaces if you want clean command-line usage (but the terminal does support them if quoted).

Example with a space:

```
$ ls
"My File.md"
```

---

## **📝 Recommended Conventions**

These are optional but help keep things tidy:

| File/Folder       | Recommendation                               |
| ----------------- | -------------------------------------------- |
| Folder names      | Capitalized (`About`, `Projects`, `Gallery`) |
| Markdown files    | Hyphen-separated (`My-Article.md`)           |
| Images            | Lowercase with dashes (`header-photo.png`)   |
| System/meta files | Always inside `_meta/`                       |

---

## **🛠 Advanced Options**

### Customizing Terminal Login Identity

In `config.php`:

```php
'shell_user' => 'kim',
'shell_host' => 'retrobox',
```

User prompt becomes:

```
kim@retrobox:~$
```

### Changing the content root

If you want content stored elsewhere:

```php
'content_root' => '/var/www/retro-content',
```

It must be readable by the PHP process.

---

## **🧪 Quick Checklist Before Deploy**

* [ ] `content/_meta/motd.md` exists
* [ ] Each top-level content area has at least one `.md` file
* [ ] PNG/JPG images stored where needed
* [ ] No unintentional giant images
* [ ] Directory/file permissions are readable

---

## **🎉 That’s It!**

Your entire site content is now fully filesystem-driven:
Just add, remove, and edit files under `/content/`, and the terminal automatically reflects it—no backend changes required.


