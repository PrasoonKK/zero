import React from 'react'
import { useChatStore } from '../stores/chatStore'
import MessageList from './MessageList'

export default function ChatWindow(): React.JSX.Element {
  const { messages } = useChatStore()

  if (messages.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
        <span className="label-caps" style={{ fontSize: 9, color: '#444748' }}>ENTER_COMMAND_TO_BEGIN</span>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 32px', minHeight: 0 }}>
      <MessageList messages={messages} />
    </div>
  )
}
