import { ollamaChat, openRouterChat, ChatMessage } from './ollama'

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

interface AgentPlan {
  steps: AgentStep[]
  explanation: string
}

const AGENT_SYSTEM = `You are a code agent for a desktop AI assistant. The user will give you a task.
Respond ONLY with valid JSON (no markdown, no extra text) in this exact format:
{"steps":[{"action":"read_file|list_files|explain|write_code|execute","description":"what this step does","filePath":"path if reading/listing","code":"code if writing/executing","language":"js|python|bash","needsApproval":false}],"explanation":"brief summary"}
Actions: read_file (read a file), list_files (list directory contents), explain (text answer), write_code (show code, needsApproval=false), execute (run code, needsApproval=true).`

// Summarize file content to keep token usage low
function summarizeFile(content: string, path: string, maxChars = 3000): string {
  if (content.length <= maxChars) return content
  const head = content.slice(0, maxChars * 0.7)
  const tail = content.slice(-maxChars * 0.15)
  return `[File: ${path} — truncated from ${content.length} chars]\n${head}\n...\n${tail}`
}

export async function runAgent(
  task: string,
  context: string,
  model: string,
  onStep: (step: AgentStep) => void,
  waitForApproval: (step: AgentStep) => Promise<boolean>,
  openRouterKey?: string,
  openRouterModel?: string,
): Promise<{ steps: AgentStep[]; finalAnswer: string }> {
  const contextBlock = context ? `\nContext:\n${context}` : ''

  const messages: ChatMessage[] = [
    { role: 'system', content: AGENT_SYSTEM },
    { role: 'user',   content: `Task: ${task}${contextBlock}` },
  ]

  // Try Ollama first, fall back to OpenRouter
  let planResponse: string
  try {
    planResponse = await ollamaChat(model, messages)
  } catch {
    if (openRouterKey) {
      try {
        planResponse = await openRouterChat(
          openRouterKey,
          openRouterModel || 'mistralai/mistral-7b-instruct:free',
          messages,
        )
      } catch (err) {
        throw new Error(`Both Ollama and OpenRouter unavailable: ${String(err)}`)
      }
    } else {
      throw new Error('Ollama is offline. Add an OpenRouter key in Settings to use agent mode without Ollama.')
    }
  }

  // Parse JSON plan
  let plan: AgentPlan
  try {
    const jsonMatch = planResponse.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('no JSON')
    plan = JSON.parse(jsonMatch[0]) as AgentPlan
    if (!Array.isArray(plan.steps)) throw new Error('no steps array')
  } catch {
    const step: AgentStep = {
      id: `step-0-${Date.now()}`,
      action: 'explain',
      description: 'Response',
      status: 'done',
      result: planResponse,
    }
    onStep(step)
    return { steps: [step], finalAnswer: planResponse }
  }

  const steps: AgentStep[] = plan.steps.map((s, i) => ({
    ...s,
    id: `step-${i}-${Date.now()}`,
    status: 'pending' as const,
  }))

  const executed: AgentStep[] = []

  for (const step of steps) {
    onStep({ ...step, status: 'running' })

    try {
      if (step.action === 'execute' || step.needsApproval) {
        onStep({ ...step, status: 'awaiting_approval' })
        const approved = await waitForApproval({ ...step, status: 'awaiting_approval' })
        if (!approved) {
          const skipped: AgentStep = { ...step, status: 'done', result: '[Skipped by user]' }
          onStep(skipped)
          executed.push(skipped)
          continue
        }
      }

      let result = ''

      if (step.action === 'read_file' && step.filePath) {
        const r = await window.ai.readFile(step.filePath)
        result = summarizeFile(r.content, step.filePath)
        if (r.truncated) result = `[File truncated at ${r.size} bytes]\n${result}`
      } else if (step.action === 'list_files' && step.filePath) {
        const files = await window.ai.listFiles(step.filePath)
        result = files.join('\n')
      } else if (step.action === 'explain') {
        result = step.result || step.description
      } else if (step.action === 'write_code') {
        result = step.code ? `\`\`\`${step.language || ''}\n${step.code}\n\`\`\`` : step.description
      } else if (step.action === 'execute' && step.code) {
        const r = await window.ai.executeCode(step.code, step.language || 'bash')
        result = r.stdout || r.stderr || `Exit code: ${r.exitCode}`
      } else {
        result = step.description
      }

      const done: AgentStep = { ...step, status: 'done', result }
      onStep(done)
      executed.push(done)
    } catch (err) {
      const error: AgentStep = { ...step, status: 'error', result: String(err) }
      onStep(error)
      executed.push(error)
    }
  }

  const finalAnswer = plan.explanation
    ? `${plan.explanation}\n\nCompleted ${executed.length} step(s).`
    : `Completed ${executed.length} step(s).`

  return { steps: executed, finalAnswer }
}
