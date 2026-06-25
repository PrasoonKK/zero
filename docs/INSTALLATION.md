# Installation Guide

This guide walks through installing Zero on Windows from scratch.

---

## Prerequisites

### 1. Node.js 18+

Download from [nodejs.org](https://nodejs.org). Choose the LTS installer. Verify after install:

```powershell
node --version   # should print v18.x.x or higher
npm --version
```

### 2. Ollama

Download from [ollama.com](https://ollama.com) and run the installer. Ollama installs as a background service that starts automatically with Windows.

Verify Ollama is running:

```powershell
ollama list
```

If the command hangs or errors, open the Ollama tray icon and click **Start**.

### 3. Git

Download from [git-scm.com](https://git-scm.com). Use all default options during setup.

---

## Step-by-Step Installation

### Step 1 — Clone the repository

```bash
git clone https://github.com/your-org/zero.git
cd zero
```

### Step 2 — Install dependencies

```bash
npm install
```

This installs all Node dependencies. No native compilation is required.

### Step 3 — Pull Ollama models

```bash
ollama pull mistral
ollama pull codellama
```

`mistral` is used for general chat. `codellama` is used in agent/code mode. Both downloads are one-time. `mistral` is approximately 4 GB; `codellama` is approximately 4 GB.

### Step 4 — Start Zero

```bash
npm run dev
```

The Electron window opens automatically. On first launch, Zero walks you through the initial configuration.

---

## First Run Walkthrough

When Zero opens for the first time:

1. **Model selection** — Zero detects your available Ollama models and pre-selects `mistral` as the chat model. Confirm or change the selection.
2. **Hotkey** — The default global hotkey is `Ctrl+Space`. You can change it now or later in Settings.
3. **Optional: OpenRouter key** — If you want cloud fallback when Ollama is offline, paste your OpenRouter API key. Leave blank to skip.
4. **Optional: Groq key** — Paste a free Groq key to enable voice input. Get one at [console.groq.com/keys](https://console.groq.com/keys).

After completing the walkthrough, Zero is ready to use.

---

## Troubleshooting

### Ollama is offline

**Symptom:** Zero shows "Ollama unreachable" or responses fail immediately.

**Fix:**
1. Open the system tray and look for the Ollama icon
2. Right-click → Start, or open the Ollama desktop app
3. Wait 5–10 seconds, then retry in Zero
4. Alternatively, run `ollama serve` in a terminal to start Ollama manually

### Model not found

**Symptom:** Error message like `model 'mistral' not found`.

**Fix:**
```bash
ollama pull mistral
```

Then open Settings in Zero and confirm the Chat Model field matches the model name exactly (e.g. `mistral`, not `mistral:latest` unless you pulled that tag).

### Voice input not working

**Symptom:** Microphone button does nothing, or transcription fails.

**Fix:**
1. Open Settings → confirm the Groq API Key field is filled in
2. Check that Windows has granted microphone permission to Zero: **Settings → Privacy → Microphone** → enable for desktop apps
3. Verify your Groq key is valid at [console.groq.com](https://console.groq.com)
4. Check the DevTools console (`Ctrl+Shift+I`) for specific error messages

### White screen on launch

**Symptom:** The Electron window is blank or shows a renderer error.

**Fix:**
```bash
npm run dev -- --reset-cache
```

If the issue persists, delete `%APPDATA%\zero-ai-assistant\` and relaunch. This resets all settings to defaults.

### Port conflict

**Symptom:** Dev server fails to start with `EADDRINUSE`.

**Fix:** Another process is using the Vite dev server port. Kill it or change the port in `vite.config.ts`.
