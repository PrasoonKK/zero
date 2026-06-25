import { IpcMain, app, clipboard, desktopCapturer, Notification } from 'electron'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { gitStatus, gitLog, gitDiff, gitBranches } from './git'
import { addMemory, getMemories, clearMemories } from './memory'

interface CommandPattern {
  regex: string
  action: string
  capture?: number
  captureDir?: number
  captureAlt?: string   // fallback value when capture group didn't match
  captureTask?: number
}

function loadPatterns(): CommandPattern[] {
  const paths = [
    join(__dirname, '../../../config/system-commands.json'),
    join(process.cwd(), 'config/system-commands.json'),
  ]
  for (const p of paths) {
    try {
      const data = JSON.parse(readFileSync(p, 'utf-8')) as { patterns: CommandPattern[] }
      return data.patterns || []
    } catch { /* try next */ }
  }
  return []
}

let weatherCache: { data: string; timestamp: number } | null = null
const WEATHER_TTL = 1800000

async function getWeather(): Promise<string> {
  if (weatherCache && Date.now() - weatherCache.timestamp < WEATHER_TTL) return weatherCache.data
  try {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 8000)
    const res = await fetch('https://wttr.in/?format=3', { signal: ac.signal })
    clearTimeout(timer)
    const text = await res.text()
    const result = `🌤 ${text.trim()}`
    weatherCache = { data: result, timestamp: Date.now() }
    return result
  } catch {
    return '⚠️ Could not fetch weather. Check your internet connection.'
  }
}

function getTime(): string {
  return `🕐 Current time: ${new Date().toLocaleTimeString()}`
}

function getDate(): string {
  return `📅 Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
}

// Search files across user directories then optionally full drive
function findFiles(pattern: string, searchDir?: string): string {
  const pat = pattern.trim()

  // If a specific dir was given, search only there
  if (searchDir) {
    return searchInDir(pat, resolve(searchDir.trim()))
  }

  // Otherwise search common user locations first (fast), then offer full search
  const userHome = process.env.USERPROFILE || process.env.HOME || 'C:\\Users'
  const commonDirs = [
    userHome,
    join(userHome, 'Desktop'),
    join(userHome, 'Documents'),
    join(userHome, 'Downloads'),
    'C:\\',
  ]

  const results: string[] = []
  for (const dir of commonDirs) {
    try {
      const out = execSync(`where /r "${dir}" *${pat}* 2>nul`, { timeout: 6000, encoding: 'utf-8' })
      const found = out.trim().split('\n').map(l => l.trim()).filter(Boolean)
      for (const f of found) {
        if (!results.includes(f)) results.push(f)
      }
      if (results.length >= 20) break
    } catch { /* no match in this dir */ }
  }

  if (!results.length) return `📂 No files matching "${pat}" found.`
  return `📂 Found ${results.length} file(s) matching "${pat}":\n${results.slice(0, 20).join('\n')}`
}

function searchInDir(pat: string, dir: string): string {
  try {
    const out = execSync(`where /r "${dir}" *${pat}* 2>nul`, { timeout: 8000, encoding: 'utf-8' })
    const files = out.trim().split('\n').map(l => l.trim()).filter(Boolean).slice(0, 20)
    if (!files.length) return `📂 No files matching "${pat}" in ${dir}`
    return `📂 Found ${files.length} file(s):\n${files.join('\n')}`
  } catch {
    return `📂 No files matching "${pat}" in ${dir}`
  }
}

function setBrightness(arg: string): string {
  const lower = arg.toLowerCase().trim()
  try {
    let level: number
    if (lower === 'up') {
      // Read current and increase by 10
      const cur = parseInt(execSync(
        `powershell -c "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness).CurrentBrightness"`,
        { timeout: 4000, encoding: 'utf-8' }
      ).trim(), 10) || 50
      level = Math.min(100, cur + 10)
    } else if (lower === 'down') {
      const cur = parseInt(execSync(
        `powershell -c "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness).CurrentBrightness"`,
        { timeout: 4000, encoding: 'utf-8' }
      ).trim(), 10) || 50
      level = Math.max(0, cur - 10)
    } else {
      level = Math.max(0, Math.min(100, parseInt(lower, 10)))
      if (isNaN(level)) return '⚠️ Usage: "brightness up/down/50"'
    }
    execSync(
      `powershell -c "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, ${level})"`,
      { timeout: 4000 }
    )
    return `☀️ Brightness set to ${level}%`
  } catch {
    return '⚠️ Could not change brightness. Your display may not support WMI brightness control.'
  }
}

function setVolume(arg: string): string {
  const lower = arg.toLowerCase().trim()
  try {
    if (lower === 'up') {
      execSync(`powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]175)"`, { timeout: 3000 })
      return '🔊 Volume increased'
    } else if (lower === 'down') {
      execSync(`powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]174)"`, { timeout: 3000 })
      return '🔉 Volume decreased'
    } else {
      const level = Math.max(0, Math.min(100, parseInt(lower, 10)))
      if (!isNaN(level)) {
        execSync(`powershell -c "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Multimedia\\Audio' -Name 'DefaultOutput.Volume' -Value ${level}"`, { timeout: 3000 })
        return `🔊 Volume set to ~${level}%`
      }
    }
  } catch { /* ignore */ }
  return '⚠️ Could not change volume'
}

// Open ANY application — uses Windows `start` shell command which resolves
// registered apps, PATH executables, and Start Menu entries automatically
function openApp(appName: string): string {
  const name = appName.trim()

  // Friendly name aliases for common apps
  const aliases: Record<string, string> = {
    'vs code': 'code',
    'vscode': 'code',
    'visual studio code': 'code',
    'terminal': 'wt',           // Windows Terminal
    'cmd': 'cmd',
    'command prompt': 'cmd',
    'powershell': 'powershell',
    'file explorer': 'explorer',
    'explorer': 'explorer',
    'task manager': 'taskmgr',
    'control panel': 'control',
    'settings': 'ms-settings:',
    'store': 'ms-windows-store:',
    'paint': 'mspaint',
    'wordpad': 'wordpad',
    'notepad': 'notepad',
    'calculator': 'calc',
    'calendar': 'outlookcal:',
    'mail': 'outlookmail:',
    'camera': 'microsoft.windows.camera:',
    'photos': 'ms-photos:',
    'maps': 'bingmaps:',
    'clock': 'ms-clock:',
    'weather': 'bingweather:',
  }

  const resolved = aliases[name.toLowerCase()] || name

  try {
    // `start ""` with shell:true lets Windows resolve everything — installed apps,
    // PATH executables, ms-protocol URIs, and Start Menu shortcuts
    execSync(`start "" "${resolved}"`, { shell: true, timeout: 5000, windowsHide: false })
    return `✅ Opening ${appName}...`
  } catch {
    // Second attempt: PowerShell Start-Process (handles edge cases)
    try {
      execSync(`powershell -c "Start-Process '${resolved.replace(/'/g, "''")}'"`, { timeout: 5000 })
      return `✅ Opening ${appName}...`
    } catch (err) {
      return `⚠️ Could not open "${appName}". Try the exact executable name (e.g. "open spotify.exe").`
    }
  }
}

// Git commands — parse optional path from command, fall back to user home
function resolveGitDir(matchPath?: string): string {
  if (matchPath) return resolve(matchPath.trim())
  // Try USERPROFILE common project locations
  const home = process.env.USERPROFILE || process.env.HOME || 'C:\\Users'
  return home
}

export async function detectSystemCommand(input: string): Promise<string | null> {
  const patterns = loadPatterns()

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex, 'i')
    const match = input.match(regex) // use original case for paths
    if (match) {
      switch (pattern.action) {
        case 'time':    return getTime()
        case 'date':    return getDate()
        case 'weather': return getWeather()
        case 'git_status': {
          const dir = resolveGitDir(match[1])
          return `\`\`\`\n${gitStatus(dir)}\n\`\`\``
        }
        case 'git_log': {
          const dir = resolveGitDir(match[1])
          return `\`\`\`\n${gitLog(dir)}\n\`\`\``
        }
        case 'git_diff': {
          const dir = resolveGitDir(match[1])
          return `\`\`\`diff\n${gitDiff(dir)}\n\`\`\``
        }
        case 'git_branches': {
          const dir = resolveGitDir(match[1])
          return `\`\`\`\n${gitBranches(dir)}\n\`\`\``
        }
        case 'git_commit_msg': {
          const dir = resolveGitDir(match[1])
          try {
            const staged = gitDiff(dir, true)
            const unstaged = gitDiff(dir, false)
            const diffContext = (staged && staged !== '(no staged changes)') ? staged : unstaged
            if (!diffContext || diffContext.startsWith('⚠')) {
              return `__LLM_CONTEXT__:Generate a concise conventional commit message (e.g. "feat: add X" or "fix: resolve Y"). No diff is staged yet — write a generic commit message template instead.`
            }
            return `__LLM_CONTEXT__:Generate a concise conventional commit message for these git changes. Format: type(scope): description — where type is feat/fix/refactor/docs/style/test/chore. Only reply with the commit message, nothing else.\n\nDiff:\n${diffContext}`
          } catch {
            return `__LLM_CONTEXT__:Generate a concise conventional commit message. Format: type(scope): description`
          }
        }
        case 'find_files': {
          const idx = pattern.capture ?? 1
          const dirIdx = pattern.captureDir ?? 2
          return findFiles(match[idx] || '', match[dirIdx])
        }
        case 'brightness': {
          const idx = pattern.capture ?? 1
          const val = (match[idx] || pattern.captureAlt || '').replace('%', '')
          return setBrightness(val)
        }
        case 'volume': {
          const idx = pattern.capture ?? 1
          const val = (match[idx] || pattern.captureAlt || '').replace('%', '')
          return setVolume(val)
        }
        case 'open_app': {
          const idx = pattern.capture ?? 1
          return openApp(match[idx] || '')
        }
        case 'screenshot': {
          try {
            const sources = await desktopCapturer.getSources({
              types: ['screen'],
              thumbnailSize: { width: 1920, height: 1080 },
            })
            if (!sources.length) return '⚠ No screen source found.'
            const img = sources[0].thumbnail
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
            const desktop = join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop')
            const outPath = join(desktop, `screenshot-${ts}.png`)
            writeFileSync(outPath, img.toPNG())
            return `📸 Screenshot saved: ${outPath}`
          } catch (e) {
            return `⚠ Screenshot failed: ${String(e)}`
          }
        }
        case 'clipboard_read': {
          const text = clipboard.readText()
          if (!text.trim()) return '📋 Clipboard is empty.'
          const preview = text.length > 800 ? text.slice(0, 800) + '\n...(truncated)' : text
          return `📋 Clipboard:\n\`\`\`\n${preview}\n\`\`\``
        }
        case 'clipboard_copy_last':
          return '__COPY_LAST__'
        case 'reminder': {
          const timeStr = (match[pattern.capture ?? 1] || '').trim().toLowerCase()
          const task    = (match[pattern.captureTask ?? 2] || timeStr).trim()

          let ms = 0
          const m = timeStr.match(/(\d+)\s*min/)
          const h = timeStr.match(/(\d+)\s*h(?:our)?/)
          const s = timeStr.match(/(\d+)\s*sec/)
          if (m) ms += parseInt(m[1]) * 60000
          if (h) ms += parseInt(h[1]) * 3600000
          if (s) ms += parseInt(s[1]) * 1000

          if (!ms || ms < 1000) return '⚠ Could not parse time. Try: "remind me in 5 minutes to check email"'

          const label = task.replace(/^\d+\s*(?:min(?:utes?)?|h(?:ours?)?|seconds?)\s*/i, '').trim() || 'Reminder'
          setTimeout(() => {
            new Notification({ title: '⏰ Zero Reminder', body: label }).show()
          }, ms)

          const display = ms >= 3600000
            ? `${Math.round(ms/3600000)} hour(s)`
            : ms >= 60000
              ? `${Math.round(ms/60000)} minute(s)`
              : `${Math.round(ms/1000)} second(s)`
          return `⏰ Reminder set for ${display}: "${label}"`
        }
        case 'sysinfo': {
          try {
            const cpu = execSync(
              `powershell -c "(Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average"`,
              { timeout: 6000, encoding: 'utf-8' }
            ).trim()
            const ram = execSync(
              `powershell -c "$o=Get-WmiObject Win32_OperatingSystem; [math]::Round(($o.TotalVisibleMemorySize-$o.FreePhysicalMemory)/1MB,1).ToString()+'/'+ [math]::Round($o.TotalVisibleMemorySize/1MB,1).ToString()+' GB'"`,
              { timeout: 6000, encoding: 'utf-8' }
            ).trim()
            const disk = execSync(
              `powershell -c "Get-PSDrive C|%{[math]::Round($_.Used/1GB,1).ToString()+'/'+[math]::Round(($_.Used+$_.Free)/1GB,1).ToString()+' GB'}"`,
              { timeout: 6000, encoding: 'utf-8' }
            ).trim()
            return `💻 System Health\n• CPU: ${cpu}% load\n• RAM: ${ram} used\n• Disk C: ${disk} used`
          } catch {
            return '⚠ Could not read system stats. Check PowerShell permissions.'
          }
        }
        case 'remember': {
          const text = (match[pattern.capture ?? 1] || '').trim()
          if (!text) return '⚠ Nothing to remember.'
          addMemory(text)
          return `✅ Got it — I'll remember: "${text}"`
        }
        case 'show_memories': {
          const entries = getMemories()
          if (!entries.length) return '📭 No memories yet. Say "remember that..." to save something.'
          const list = entries.slice(-10).reverse().map((e, i) => `${i+1}. ${e.text}`).join('\n')
          return `🧠 I remember (last ${Math.min(10, entries.length)}):\n\n${list}`
        }
        case 'clear_memories': {
          clearMemories()
          return '🗑 All memories cleared.'
        }
        case 'quit':
          setTimeout(() => app.exit(0), 500)
          return 'Goodbye! Closing Zero...'
        default:
          return null
      }
    }
  }
  return null
}

export function registerSystemHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('ai:systemCommand', async (_event, input: string) => {
    return detectSystemCommand(input)
  })
}
