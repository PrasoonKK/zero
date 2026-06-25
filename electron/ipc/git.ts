import { IpcMain } from 'electron'
import { execSync } from 'child_process'

function runGit(args: string, cwd: string): string {
  try {
    return execSync(`git ${args}`, { cwd, encoding: 'utf-8', timeout: 8000, stdio: ['pipe','pipe','pipe'] }).trim()
  } catch (err: unknown) {
    const e = err as { stderr?: Buffer | string; message?: string }
    const msg = e.stderr ? e.stderr.toString().trim() : (e.message ?? String(err))
    throw new Error(msg || `git ${args} failed`)
  }
}

export function isGitRepo(cwd: string): boolean {
  try { runGit('rev-parse --git-dir', cwd); return true } catch { return false }
}

export function gitStatus(cwd: string): string {
  if (!isGitRepo(cwd)) return '⚠ Not a git repository.'
  const branch = runGit('branch --show-current', cwd)
  const status = runGit('status --short', cwd)
  return `Branch: ${branch || 'HEAD detached'}\n${status || '(clean)'}`
}

export function gitLog(cwd: string, n = 15): string {
  if (!isGitRepo(cwd)) return '⚠ Not a git repository.'
  return runGit(`log --oneline --graph -${n}`, cwd)
}

export function gitDiff(cwd: string, staged = false): string {
  if (!isGitRepo(cwd)) return '⚠ Not a git repository.'
  const diff = runGit(staged ? 'diff --staged' : 'diff HEAD', cwd)
  if (!diff) return staged ? '(no staged changes)' : '(no changes)'
  // Truncate large diffs
  if (diff.length > 8000) return diff.slice(0, 8000) + '\n\n[... diff truncated ...]'
  return diff
}

export function gitBranches(cwd: string): string {
  if (!isGitRepo(cwd)) return '⚠ Not a git repository.'
  return runGit('branch -a', cwd)
}

export function gitCommit(cwd: string, message: string): string {
  if (!isGitRepo(cwd)) return '⚠ Not a git repository.'
  try {
    runGit(`commit -m "${message.replace(/"/g, '\\"')}"`, cwd)
    return `✅ Committed: "${message}"`
  } catch (err) {
    return `⚠ Commit failed: ${String(err)}`
  }
}

export function registerGitHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('ai:gitStatus',   async (_e, cwd: string) => gitStatus(cwd))
  ipcMain.handle('ai:gitLog',      async (_e, cwd: string, n?: number) => gitLog(cwd, n))
  ipcMain.handle('ai:gitDiff',     async (_e, cwd: string, staged?: boolean) => gitDiff(cwd, staged))
  ipcMain.handle('ai:gitBranches', async (_e, cwd: string) => gitBranches(cwd))
  ipcMain.handle('ai:gitCommit',   async (_e, cwd: string, message: string) => gitCommit(cwd, message))
}
