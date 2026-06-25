import { IpcMain } from 'electron'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { execSync } from 'child_process'
import { chat } from './llm'

export interface AgentStep {
  id: string
  action: 'read_file' | 'list_files' | 'explain' | 'write_code' | 'execute'
  description: string
  status: 'pending' | 'running' | 'done' | 'error' | 'awaiting_approval'
  result?: string
  code?: string
  language?: string
  filePath?: string
  needsApproval?: boolean
}

export interface AgentPlan {
  steps: AgentStep[]
  explanation: string
}

interface AgentResult {
  steps: AgentStep[]
  finalAnswer: string
}

const approvalMap = new Map<string, { resolve: (v: boolean) => void; reject: (e: Error) => void }>()

export function readFile(filePath: string): { content: string; truncated: boolean; size: number } {
  const MAX_SIZE = 10 * 1024 // 10KB
  const abs = resolve(filePath)
  const content = readFileSync(abs, 'utf-8')
  const size = Buffer.byteLength(content, 'utf-8')
  if (size > MAX_SIZE) {
    const truncated = content.slice(0, MAX_SIZE)
    return { content: truncated + `\n\n[... truncated, total ${size} bytes ...]`, truncated: true, size }
  }
  return { content, truncated: false, size }
}

export function listFiles(dirPath: string): string[] {
  const IGNORED = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.DS_Store'])
  const abs = resolve(dirPath)
  const entries = readdirSync(abs)
  return entries
    .filter(e => !IGNORED.has(e))
    .map(e => {
      try {
        const st = statSync(join(abs, e))
        return st.isDirectory() ? `${e}/` : e
      } catch {
        return e
      }
    })
}

export function executeCode(code: string, language: string): { stdout: string; stderr: string; exitCode: number } {
  const TIMEOUT = 10000
  const supported = ['js', 'javascript', 'python', 'python3', 'bash', 'sh']
  if (!supported.includes(language.toLowerCase())) {
    return { stdout: '', stderr: `Unsupported language: ${language}. Supported: js, python, bash`, exitCode: 1 }
  }
  try {
    let cmd: string
    const lang = language.toLowerCase()
    if (lang === 'js' || lang === 'javascript') {
      const escaped = code.replace(/'/g, "'\\''")
      cmd = `node -e '${escaped}'`
    } else if (lang === 'python' || lang === 'python3') {
      const escaped = code.replace(/'/g, "'\\''")
      cmd = `python3 -c '${escaped}'`
    } else {
      const escaped = code.replace(/'/g, "'\\''")
      cmd = `bash -c '${escaped}'`
    }
    const stdout = execSync(cmd, { timeout: TIMEOUT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    return { stdout: stdout.toString(), stderr: '', exitCode: 0 }
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number; message?: string }
    return {
      stdout: e.stdout ? e.stdout.toString() : '',
      stderr: e.stderr ? e.stderr.toString() : (e.message ?? String(err)),
      exitCode: e.status ?? 1
    }
  }
}

export async function runAgentTask(
  task: string,
  context: string,
  onStep: (step: AgentStep) => void,
  settings?: Record<string, string>
): Promise<AgentResult> {
  const contextBlock = context ? `\nContext:\n${context}` : ''
  const planResponse = await chat(
    `Task: ${task}${contextBlock}\n\nRespond ONLY with valid JSON for the agent plan.`,
    'agent',
    settings
  )

  let plan: AgentPlan
  try {
    const jsonMatch = planResponse.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')
    plan = JSON.parse(jsonMatch[0]) as AgentPlan
    if (!plan.steps || !Array.isArray(plan.steps)) throw new Error('Invalid plan structure')
  } catch {
    const fallbackStep: AgentStep = {
      id: `step-${Date.now()}`,
      action: 'explain',
      description: 'Direct response',
      status: 'done',
      result: planResponse,
    }
    return { steps: [fallbackStep], finalAnswer: planResponse }
  }

  const steps: AgentStep[] = plan.steps.map((s, i) => ({
    ...s,
    id: s.id || `step-${i}-${Date.now()}`,
    status: 'pending' as const,
  }))

  const executedSteps: AgentStep[] = []

  for (const step of steps) {
    const running: AgentStep = { ...step, status: 'running' }
    onStep(running)

    try {
      if (step.action === 'execute' || step.needsApproval) {
        const awaiting: AgentStep = { ...step, status: 'awaiting_approval' }
        onStep(awaiting)
        const approved = await waitForApproval(step.id)
        if (!approved) {
          const skipped: AgentStep = { ...step, status: 'done', result: '[Execution skipped by user]' }
          onStep(skipped)
          executedSteps.push(skipped)
          continue
        }
      }

      let result = ''

      if (step.action === 'read_file' && step.filePath) {
        const r = readFile(step.filePath)
        result = r.truncated ? `[truncated, ${r.size} bytes]\n${r.content}` : r.content
      } else if (step.action === 'list_files' && step.filePath) {
        const files = listFiles(step.filePath)
        result = files.join('\n')
      } else if (step.action === 'explain') {
        result = step.result || step.description
      } else if (step.action === 'write_code') {
        result = step.code ? `\`\`\`${step.language || ''}\n${step.code}\n\`\`\`` : step.description
      } else if (step.action === 'execute' && step.code) {
        const exec = executeCode(step.code, step.language || 'bash')
        result = exec.stdout || exec.stderr || `Exit code: ${exec.exitCode}`
      } else {
        result = step.description
      }

      const done: AgentStep = { ...step, status: 'done', result }
      onStep(done)
      executedSteps.push(done)
    } catch (err) {
      const error: AgentStep = { ...step, status: 'error', result: String(err) }
      onStep(error)
      executedSteps.push(error)
    }
  }

  const summary = executedSteps
    .map(s => `[${s.action}] ${s.description}: ${s.result?.slice(0, 200) ?? ''}`)
    .join('\n')

  const finalAnswer = plan.explanation
    ? `${plan.explanation}\n\nCompleted ${executedSteps.length} step(s).`
    : `Completed ${executedSteps.length} step(s).\n${summary}`

  return { steps: executedSteps, finalAnswer }
}

function waitForApproval(stepId: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    approvalMap.set(stepId, { resolve, reject })
    setTimeout(() => {
      if (approvalMap.has(stepId)) {
        approvalMap.delete(stepId)
        resolve(false)
      }
    }, 60000)
  })
}

export function registerAgentHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('ai:readFile', async (_event, filePath: string) => {
    return readFile(filePath)
  })

  ipcMain.handle('ai:listFiles', async (_event, dirPath: string) => {
    return listFiles(dirPath)
  })

  ipcMain.handle('ai:executeCode', async (_event, code: string, language: string) => {
    return executeCode(code, language)
  })

  ipcMain.handle('ai:approveExecution', async (_event, stepId: string, approved: boolean) => {
    const pending = approvalMap.get(stepId)
    if (pending) {
      approvalMap.delete(stepId)
      pending.resolve(approved)
    }
  })

  ipcMain.handle('ai:runAgent', async (event, task: string, context: string, channel: string) => {
    const settings = {} as Record<string, string>
    return runAgentTask(task, context, (step) => {
      event.sender.send(channel, step)
    }, settings)
  })
}
