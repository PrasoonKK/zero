# Zero

**Free, local-first AI desktop assistant**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-blue.svg)](https://www.microsoft.com/windows)
[![Built with Electron](https://img.shields.io/badge/Built%20with-Electron-47848F.svg)](https://www.electronjs.org/)

Zero is a privacy-first AI assistant that runs entirely on your machine using [Ollama](https://ollama.com) for local LLM inference. No cloud required. No data leaves your device unless you explicitly enable the OpenRouter fallback.

---

## Features

- **Chat with memory** — Conversations persist across sessions with a built-in cache layer
- **Agent mode** — Let Zero autonomously plan and execute multi-step tasks
- **Voice input** — Speak your prompts via Groq Whisper (free API)
- **Plugin system** — Extend Zero with custom JavaScript plugins
- **OpenRouter fallback** — Optionally route to cloud models when Ollama is offline
- **Light / dark themes** — Switch themes from the Settings panel
- **Accent color picker** — Personalize the UI color scheme
- **System commands** — Built-in commands for time, weather, file search, volume, git, and more — all processed locally with zero tokens

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org) | 18 or higher | LTS recommended |
| [Ollama](https://ollama.com) | Latest | Must be running before starting Zero |
| [Git](https://git-scm.com) | Any | For cloning the repo |

---

## Quick Start

```bash
git clone https://github.com/your-org/zero.git
cd zero
npm install
npm run dev
```

Zero opens automatically. Make sure Ollama is running in the background first.

---

## Ollama Setup

Pull the recommended models before launching Zero:

```bash
# General chat
ollama pull mistral

# Code assistance
ollama pull codellama
```

You can use any model available on [ollama.com/library](https://ollama.com/library). Set your preferred models in Settings after launch.

---

## Configuration

Open **Settings** (gear icon or `Ctrl+,`) to configure Zero:

| Setting | Description |
|---|---|
| **Chat Model** | Ollama model used for general conversation (e.g. `mistral`) |
| **Coder Model** | Ollama model used in agent/code mode (e.g. `codellama`) |
| **OpenRouter API Key** | Optional fallback when Ollama is offline |
| **OpenRouter Model** | Model slug to use via OpenRouter (e.g. `mistralai/mistral-7b-instruct:free`) |
| **Groq API Key** | Required for voice input (free at [console.groq.com/keys](https://console.groq.com/keys)) |
| **Global Hotkey** | Keyboard shortcut to show/hide Zero (default: `Ctrl+Space`) |
| **Theme** | `light` or `dark` |
| **Accent Color** | Hex color code for UI highlights |

Settings are stored at `%APPDATA%\zero-ai-assistant\zero-cache.json`.

---

## System Commands

These commands are handled locally — they consume **zero tokens**:

| Command | Example | Description |
|---|---|---|
| `time` | `what's the time` | Current local time |
| `date` | `what's today's date` | Current date |
| `weather` | `weather` | Local weather (requires internet) |
| `open [app]` | `open notepad` | Launch an application |
| `find [file]` | `find report.pdf` | Search for a file |
| `volume up` | `volume up` | Increase system volume |
| `volume down` | `volume down` | Decrease system volume |
| `git status` | `git status` | Run git status in current directory |
| `git log` | `git log` | Recent git commits |
| `commit message` | `commit message` | Generate a commit message from staged diff |

---

## Voice Input

1. Get a free API key at [console.groq.com/keys](https://console.groq.com/keys)
2. Open Settings → paste the key in the **VOICE_INPUT** / Groq API Key field
3. Click the microphone icon (or press `Ctrl+M`) to start recording
4. Release to transcribe and send

Voice transcription uses Groq's Whisper endpoint and is billed to your free Groq quota.

---

## Plugin Development

Plugins are JavaScript files placed in `%APPDATA%\zero-ai\plugins\`. Each plugin exports a trigger pattern and a handler:

```js
// %APPDATA%\zero-ai\plugins\hello.js
module.exports = {
  name: 'hello',
  triggers: ['hello', 'hi there'],
  async handler(input, api) {
    return `Hello! You said: ${input}`;
  }
};
```

Available API methods inside `handler`:

| Method | Description |
|---|---|
| `api.readFile(path)` | Read a file from disk |
| `api.listFiles(dir)` | List files in a directory |
| `api.http(url, options)` | Make an HTTP request |

See [docs/PLUGIN_DEVELOPMENT.md](docs/PLUGIN_DEVELOPMENT.md) for full documentation.

---

## Build for Production

```bash
npm run build:win
```

The installer is output to `dist/`. Requires Windows build tools.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Space` | Show / hide Zero (global, customizable) |
| `Ctrl+,` | Open Settings |
| `Ctrl+M` | Toggle voice input |
| `Ctrl+N` | New conversation |
| `Ctrl+L` | Clear current chat |
| `Ctrl+Shift+A` | Toggle agent mode |
| `Escape` | Close panel / cancel |

---

## License

MIT — see [LICENSE](LICENSE) for details.
