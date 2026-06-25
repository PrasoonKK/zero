import React from 'react'
import { useChatStore } from '../stores/chatStore'

export default function ModeToggle(): React.JSX.Element {
  const { mode, setMode, clearMessages, clearAgentSteps } = useChatStore()

  const handleSwitch = (newMode: 'assistant' | 'coder' | 'agent') => {
    if (newMode !== mode) {
      setMode(newMode)
      clearMessages()
      clearAgentSteps()
    }
  }

  return (
    <div className="flex items-center bg-[#0f0f0f] border border-[#2a2a2a] rounded-full p-1 gap-0.5">
      <button
        onClick={() => handleSwitch('assistant')}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${mode === 'assistant' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
      >
        🤖 Assistant
      </button>
      <button
        onClick={() => handleSwitch('coder')}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${mode === 'coder' ? 'bg-green-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
      >
        💻 Coder
      </button>
      <button
        onClick={() => handleSwitch('agent')}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${mode === 'agent' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
      >
        🔧 Agent
      </button>
    </div>
  )
}
