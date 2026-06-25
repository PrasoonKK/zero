import React from 'react'
import { useChatStore } from '../stores/chatStore'

// ── 3D Atom — orbiting rings + electrons ──────────────────────────────────
function Atom3D({ size, isProcessing, isOnline }: { size: number; isProcessing: boolean; isOnline: boolean }): React.JSX.Element {
  const accent = isOnline ? 'var(--accent)' : '#ffb4ab'
  const glow   = isOnline ? 'rgba(var(--accent-rgb),' : 'rgba(255,180,171,'

  const rings = [
    {
      // Whole orbital plane precesses around Y
      precession: `gyro-y`, precessionSpeed: isProcessing ? '3s'   : '12s', precessionDir: 'normal',
      // Orbital tilt within that plane
      tilt: 'rotateX(72deg)',
      // Electron speed along the ring
      electronSpeed: isProcessing ? '0.8s' : '3s', electronDir: 'normal',
      opacity: 0.32,
    },
    {
      precession: `gyro-x`, precessionSpeed: isProcessing ? '4s'   : '17s', precessionDir: 'reverse',
      tilt: 'rotateX(72deg) rotateZ(60deg)',
      electronSpeed: isProcessing ? '1.1s' : '4.5s', electronDir: 'reverse',
      opacity: 0.24,
    },
    {
      precession: `gyro-z`, precessionSpeed: isProcessing ? '5s'   : '22s', precessionDir: 'normal',
      tilt: 'rotateX(72deg) rotateZ(120deg)',
      electronSpeed: isProcessing ? '1.4s' : '6s', electronDir: 'normal',
      opacity: 0.17,
    },
  ]

  return (
    <div style={{ width: size, height: size, position: 'relative', perspective: '900px' }}>
      <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d' }}>

        {rings.map(({ precession, precessionSpeed, precessionDir, tilt, electronSpeed, electronDir, opacity }, i) => (
          // Layer 1: slow precession of the whole orbital plane
          <div key={i} style={{
            position: 'absolute', inset: 0,
            animation: `${precession} ${precessionSpeed} linear ${precessionDir} infinite`,
            transformStyle: 'preserve-3d',
          }}>
            {/* Layer 2: orbital plane tilt (makes ring look like an ellipse) */}
            <div style={{
              position: 'absolute', inset: 0,
              transform: tilt,
              transformStyle: 'preserve-3d',
            }}>
              {/* The ring path */}
              <div style={{
                position: 'absolute', inset: 0,
                borderRadius: '50%',
                border: `1px solid ${glow}${opacity})`,
                boxShadow: isProcessing ? `0 0 5px 1px ${glow}${opacity * 0.7})` : 'none',
                transition: 'box-shadow 0.4s ease',
              }} />
              {/* Electron spinner — orbits within the tilted plane */}
              <div style={{
                position: 'absolute', inset: 0,
                animation: `ring-spin ${electronSpeed} linear ${electronDir} infinite`,
              }}>
                <div style={{
                  position: 'absolute',
                  top: -4, left: '50%',
                  transform: 'translateX(-50%)',
                  width: 7, height: 7,
                  borderRadius: '50%',
                  background: accent,
                  boxShadow: `0 0 10px 3px ${glow}0.85)`,
                }} />
              </div>
            </div>
          </div>
        ))}

        {/* Nucleus */}
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 14, height: 14,
          borderRadius: '50%',
          background: accent,
          boxShadow: isProcessing
            ? `0 0 28px 8px ${glow}0.5)`
            : `0 0 18px 5px ${glow}0.35)`,
          zIndex: 10,
          transition: 'all 0.5s ease',
        }} />
      </div>
    </div>
  )
}

// ── Mode Cards ──────────────────────────────────────────────────────────────
const MODE_CARDS = [
  { mode: 'assistant' as const, label: 'ASSISTANT', sub: 'General purpose neural\ninterface for any question' },
  { mode: 'coder'     as const, label: 'CODER',     sub: 'Code synthesis, debugging\nand refactoring' },
  { mode: 'agent'     as const, label: 'AGENT',     sub: 'Multi-step autonomous\ntask execution' },
]

interface Props {
  onNavigate: (mode: 'assistant' | 'coder' | 'agent') => void
}

export default function HomePage({ onNavigate }: Props): React.JSX.Element {
  const { ollamaOnline, isLoading, settings } = useChatStore()

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 52, minHeight: 0, padding: '32px 48px',
    }}>

      {/* 3D Atom — no corner labels (those are in the header bar now) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div className="label-caps" style={{ fontSize: 9, color: '#8e9192', marginBottom: 8 }}>NEURAL_CORE</div>
        <Atom3D size={300} isProcessing={isLoading} isOnline={ollamaOnline} />
        {isLoading && (
          <div className="label-caps" style={{ fontSize: 9, color: 'var(--accent)', marginTop: 8, letterSpacing: '0.2em' }}>
            PROCESSING<span className="cursor-blink">_</span>
          </div>
        )}
      </div>

      {/* Mode buttons */}
      <div style={{ display: 'flex', gap: 16, width: '100%', maxWidth: 680, justifyContent: 'center' }}>
        {MODE_CARDS.map(({ mode, label, sub }) => (
          <ModeCard key={mode} label={label} sub={sub} onClick={() => onNavigate(mode)} />
        ))}
      </div>
    </div>
  )
}

function ModeCard({ label, sub, onClick }: { label: string; sub: string; onClick: () => void }): React.JSX.Element {
  const [hovered, setHovered] = React.useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="active:scale-[0.97]"
      style={{
        flex: 1,
        padding: '22px 20px',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        background: hovered ? 'rgba(var(--accent-rgb),0.06)' : 'rgba(30,31,36,0.5)',
        border: `1px solid ${hovered ? 'rgba(var(--accent-rgb),0.35)' : 'rgba(68,71,72,0.4)'}`,
        borderRadius: 4,
        backdropFilter: 'blur(8px)',
        boxShadow: hovered ? '0 0 20px rgba(var(--accent-rgb),0.06)' : 'none',
      }}
    >
      {/* Accent bar */}
      <div style={{
        width: 24, height: 2, marginBottom: 14,
        background: hovered ? 'var(--accent)' : 'rgba(var(--accent-rgb),0.3)',
        transition: 'background 0.2s ease',
      }} />
      <div className="label-caps" style={{ fontSize: 11, color: hovered ? 'var(--accent)' : '#c4c7c8', marginBottom: 8 }}>
        {label}
      </div>
      <div className="font-mono" style={{ fontSize: 11, color: '#8e9192', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
        {sub}
      </div>
    </button>
  )
}
