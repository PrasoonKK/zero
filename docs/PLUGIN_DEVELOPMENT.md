# Plugin Development Guide

Plugins let you extend Zero with custom commands and integrations without modifying the core application.

---

## Plugin Location

Place plugin files in:

```
%APPDATA%\zero-ai\plugins\
```

On a typical Windows installation:

```
C:\Users\<YourName>\AppData\Roaming\zero-ai\plugins\
```

Create the directory if it does not exist. Zero scans this folder at startup and reloads plugins when you restart.

---

## Plugin File Format

A plugin is a single CommonJS JavaScript file. It must export an object with the following shape:

```js
module.exports = {
  // Unique identifier for the plugin
  name: 'my-plugin',

  // Array of strings. Zero checks if the user's input contains any of these
  // strings (case-insensitive) before calling this plugin's handler.
  triggers: ['trigger phrase', 'another trigger'],

  // Called when a trigger matches.
  // input  — the full user message as a string
  // api    — helper methods (see API Reference below)
  // Returns a string or a Promise that resolves to a string.
  async handler(input, api) {
    return 'Response text shown in the chat';
  }
};
```

If a trigger matches, Zero calls the handler and displays the returned string directly in chat. The LLM is **not** invoked, so plugin responses consume zero tokens.

---

## API Reference

The `api` object passed to your handler provides the following methods:

### `api.readFile(filePath)`

Reads the contents of a file. Returns a Promise resolving to a UTF-8 string.

```js
const content = await api.readFile('C:\\Users\\me\\notes.txt');
```

### `api.listFiles(dirPath)`

Lists files in a directory. Returns a Promise resolving to an array of file name strings.

```js
const files = await api.listFiles('C:\\Users\\me\\Documents');
// ['report.pdf', 'notes.txt', 'budget.xlsx']
```

### `api.http(url, options)`

Makes an HTTP request. `options` is passed to the underlying `fetch` call. Returns a Promise resolving to the parsed JSON body, or a string for non-JSON responses.

```js
const data = await api.http('https://api.example.com/data', {
  method: 'GET',
  headers: { 'Authorization': 'Bearer my-token' }
});
```

---

## Trigger Matching

Zero checks the user's input against each plugin's `triggers` array using a case-insensitive substring match. The first plugin whose trigger matches is used. Core system commands (time, date, weather, etc.) are checked before plugins, so avoid duplicating those trigger words.

Keep triggers specific enough to avoid false matches. For example, use `'check weather london'` rather than just `'weather'` if you want a plugin to handle a specific city.

---

## Example: Weather Plugin

```js
// %APPDATA%\zero-ai\plugins\weather.js
module.exports = {
  name: 'weather',
  triggers: ['weather in', 'forecast for'],
  async handler(input, api) {
    // Extract city name after "weather in" or "forecast for"
    const city = input.replace(/weather in|forecast for/i, '').trim();
    if (!city) return 'Please specify a city, e.g. "weather in London".';

    const url = `https://wttr.in/${encodeURIComponent(city)}?format=3`;
    const result = await api.http(url, { headers: { 'Accept': 'text/plain' } });
    return result || `Could not fetch weather for ${city}.`;
  }
};
```

**Usage in Zero:** `weather in Tokyo` → returns current conditions for Tokyo.

---

## Example: File Counter Plugin

```js
// %APPDATA%\zero-ai\plugins\file-counter.js
module.exports = {
  name: 'file-counter',
  triggers: ['how many files in', 'count files in'],
  async handler(input, api) {
    const dir = input.replace(/how many files in|count files in/i, '').trim();
    if (!dir) return 'Please provide a directory path.';

    try {
      const files = await api.listFiles(dir);
      return `Found ${files.length} file(s) in ${dir}.`;
    } catch (err) {
      return `Could not read directory: ${err.message}`;
    }
  }
};
```

**Usage in Zero:** `how many files in C:\Users\me\Downloads` → returns file count.

---

## Tips

- Return plain text or Markdown — Zero renders Markdown in the chat window
- Keep handlers fast. Long-running operations block the chat UI
- Handle errors gracefully and return a user-friendly string rather than throwing
- Test your plugin by restarting Zero and checking the DevTools console (`Ctrl+Shift+I`) for load errors
- Plugins run in the main Electron process and have full Node.js access — be careful with user-provided paths
