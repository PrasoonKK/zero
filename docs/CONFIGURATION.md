# Configuration Reference

Zero stores all settings in a single JSON file on your machine. This document describes every field.

---

## Settings File Location

```
%APPDATA%\zero-ai-assistant\zero-cache.json
```

On a typical Windows installation this resolves to:

```
C:\Users\<YourName>\AppData\Roaming\zero-ai-assistant\zero-cache.json
```

The file is created automatically on first launch. You can edit it directly in a text editor, or use the Settings panel inside Zero (`Ctrl+,`).

---

## All Settings Fields

### `chatModel`

| Field | Value |
|---|---|
| Type | `string` |
| Default | `"mistral"` |
| Example | `"llama3"`, `"phi3"`, `"mistral"` |

The Ollama model used for general conversation. Must match the name of a model you have pulled locally (`ollama list` to check). If the model is not found, Zero falls back to OpenRouter if a key is configured.

---

### `coderModel`

| Field | Value |
|---|---|
| Type | `string` |
| Default | `"codellama"` |
| Example | `"codellama"`, `"deepseek-coder"`, `"starcoder2"` |

The Ollama model used in agent mode and for code-related queries. Selecting a code-specialized model improves output quality for programming tasks.

---

### `hotkey`

| Field | Value |
|---|---|
| Type | `string` |
| Default | `"Ctrl+Space"` |
| Example | `"Alt+Z"`, `"Ctrl+Shift+Space"` |

Global keyboard shortcut to show or hide the Zero window from anywhere on the desktop. Uses Electron's [accelerator format](https://www.electronjs.org/docs/latest/api/accelerator). Changes take effect after restarting Zero.

---

### `theme`

| Field | Value |
|---|---|
| Type | `"light"` or `"dark"` |
| Default | `"dark"` |

UI color theme. Zero respects your choice regardless of the Windows system theme setting.

---

### `accentColor`

| Field | Value |
|---|---|
| Type | `string` (hex color) |
| Default | `"#6366f1"` |
| Example | `"#10b981"`, `"#f59e0b"` |

Hex color code applied to buttons, highlights, and interactive elements throughout the UI. Use the color picker in Settings to choose visually.

---

### `openrouterKey`

| Field | Value |
|---|---|
| Type | `string` |
| Default | `""` (empty, disabled) |
| Sensitive | Yes — treat like a password |

API key for [OpenRouter](https://openrouter.ai). When set, Zero routes requests through OpenRouter if Ollama is unreachable or returns an error. Get a key at [openrouter.ai/keys](https://openrouter.ai/keys). The free tier includes access to several models with no cost.

---

### `openrouterModel`

| Field | Value |
|---|---|
| Type | `string` |
| Default | `"mistralai/mistral-7b-instruct:free"` |
| Example | `"openai/gpt-3.5-turbo"`, `"google/gemma-7b-it:free"` |

The OpenRouter model slug to use when falling back to the cloud. Use the `:free` suffix variants to stay within the free tier. Full model list at [openrouter.ai/models](https://openrouter.ai/models).

---

### `groqKey`

| Field | Value |
|---|---|
| Type | `string` |
| Default | `""` (empty, voice disabled) |
| Sensitive | Yes |

API key for [Groq](https://console.groq.com). Required for voice input. Groq provides free access to Whisper for transcription. Get a key at [console.groq.com/keys](https://console.groq.com/keys). When this field is empty, the microphone button is hidden.

---

## Example Configuration File

```json
{
  "chatModel": "mistral",
  "coderModel": "codellama",
  "hotkey": "Ctrl+Space",
  "theme": "dark",
  "accentColor": "#6366f1",
  "openrouterKey": "",
  "openrouterModel": "mistralai/mistral-7b-instruct:free",
  "groqKey": ""
}
```

---

## Environment Details

Zero does not use environment variables for configuration at runtime. All settings are read from the JSON file above. During development, Vite uses a `.env` file at the project root for build-time constants — see `.env.example` for the available keys.

The settings file is never transmitted to any server. OpenRouter and Groq API keys are sent only to their respective services when you actively use those features.
