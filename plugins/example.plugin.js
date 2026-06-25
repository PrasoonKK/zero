// Example Zero AI plugin — copy this file to:
//   %APPDATA%\zero-ai\plugins\your-plugin-name.plugin.js
// Then reload plugins from Settings (or restart the app).
//
// Plugin API available in handler:
//   api.readFile(path)      → string (first 10KB)
//   api.listFiles(path)     → string[] (filenames)
//   api.http(url)           → string (raw response body)

module.exports = {
  name: 'example',
  description: 'Replies to greetings with a custom message',

  // Any message containing one of these words (case-insensitive) triggers this plugin
  triggers: ['hello plugin', 'hi plugin'],

  handler: async (input, api) => {
    const hour = new Date().getHours()
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
    return `${greeting}! You said: "${input}"\n\nThis is a response from the example plugin.`
  },
}
