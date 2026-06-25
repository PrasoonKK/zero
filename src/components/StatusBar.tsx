import React from 'react'
import { useChatStore } from '../stores/chatStore'

export default function StatusBar(): React.JSX.Element {
  const { mode, settings, ollamaOnline, isLoading, provider, isCompact } = useChatStore()
  const activeModel = mode === 'coder' ? settings.coderModel : settings.chatModel

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-[#0a0a0a] border-t border-[#1a1a1a] text-[11px] text-gray-600 shrink-0">
      <span className={`flex items-center gap-1.5 ${ollamaOnline ? 'text-green-500' : 'text-red-500'}`}>
        <span className="text-[9px]">{ollamaOnline ? '●' : '○'}</span>
        <span>{ollamaOnline ? 'Ollama Online' : 'Ollama Offline'}</span>
      </span>
      <span className="text-[#222]">│</span>
      <span className="flex items-center gap-1">
        <span className="text-gray-700">model:</span>
        <span className="font-mono text-gray-500">{activeModel}</span>
      </span>
      <span className="text-[#222]">│</span>
      <span className={`font-medium ${mode === 'coder' ? 'text-green-600' : mode === 'agent' ? 'text-purple-500' : 'text-blue-600'}`}>
        {mode === 'coder' ? '💻 Coder' : mode === 'agent' ? '🔧 Agent' : '🤖 Assistant'}
      </span>
      {provider === 'openrouter' && (
        <>
          <span className="text-[#222]">│</span>
          <span className="text-orange-500 text-[10px]">via openrouter</span>
        </>
      )}
      {isCompact && (
        <>
          <span className="text-[#222]">│</span>
          <span className="text-gray-600">compact</span>
        </>
      )}
      {isLoading && (
        <>
          <span className="text-[#222]">│</span>
          <span className="text-yellow-600 flex items-center gap-1">
            <span className="inline-block w-2 h-2 border border-yellow-600 border-t-transparent rounded-full animate-spin" />
            Thinking...
          </span>
        </>
      )}
      <span className="ml-auto text-gray-700">Ctrl+Shift+A to toggle</span>
    </div>
  )
}
