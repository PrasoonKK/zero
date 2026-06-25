import React from 'react'

interface Props {
  onStop: () => void
  volume?: number   // 0–100 live volume from VAD
}

export default function VoiceIndicator({ onStop, volume = 0 }: Props): React.JSX.Element {
  // Scale bar heights by live volume (0-100) or fall back to static animation
  const BASE = [3, 6, 10, 14, 10, 6, 3, 6, 10]
  const bars = BASE.map(b => volume > 0 ? Math.max(2, (b / 14) * (4 + volume * 0.1 * 10)) : b)

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
      title="Click to stop"
    >
      <div className="flex items-center gap-0.5 h-4">
        {bars.map((h, i) => (
          <div
            key={i}
            className="w-0.5 bg-[#ffb4ab] origin-center"
            style={{
              height: `${h}px`,
              transition: 'height 0.08s ease',
              animation: volume === 0 ? 'ring-pulse 0.6s ease-in-out infinite' : 'none',
              animationDelay: `${i * 0.07}s`,
              borderRadius: '1px',
            }}
          />
        ))}
      </div>
      <span className="label-caps text-[9px] text-[#ffb4ab] flex-1">LISTENING — CLICK TO STOP</span>
      <span className="w-1.5 h-1.5 rounded-full bg-[#ffb4ab] animate-pulse shrink-0" />
    </div>
  )
}
