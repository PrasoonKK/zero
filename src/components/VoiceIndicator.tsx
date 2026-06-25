import React from 'react'

interface Props {
  onStop: () => void
}

export default function VoiceIndicator({ onStop }: Props): React.JSX.Element {
  return (
    <div
      className="mx-5 px-4 py-2.5 flex items-center gap-3 cursor-pointer transition-all"
      style={{
        background: 'rgba(255,180,171,0.06)',
        border: '1px solid rgba(255,180,171,0.25)',
        borderRadius: '2px',
      }}
      onClick={onStop}
      role="button"
      title="Click to stop recording"
    >
      {/* Waveform */}
      <div className="flex items-center gap-0.5 h-4">
        {[3, 6, 10, 14, 10, 6, 3, 6, 10].map((h, i) => (
          <div
            key={i}
            className="w-0.5 bg-[#ffb4ab] origin-center"
            style={{
              height: `${h}px`,
              animation: 'ring-pulse 0.6s ease-in-out infinite',
              animationDelay: `${i * 0.07}s`,
              borderRadius: '1px',
            }}
          />
        ))}
      </div>
      <span className="label-caps text-[9px] text-[#ffb4ab] flex-1">RECORDING — CLICK TO STOP</span>
      <span className="w-1.5 h-1.5 rounded-full bg-[#ffb4ab] animate-pulse shrink-0" />
    </div>
  )
}
