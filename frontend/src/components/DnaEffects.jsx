import { useEffect, useState } from 'react'

// Choto choto "live" UI element gula ekhane — DNA / forensic feel dewar jonno
// (UI upgrade - Member 1). Shob styling index.css e ache.

// 1) DnaHelix — ghurte thaka DNA er sidi (double helix)
// Protiti "rung" holo ekta line, tar dui mathay duita dot.
// Protiti rung er animation ektu por por shuru hoy, tai pura ta pechano DNA er moto dekhay.
export function DnaHelix({ rungs = 6, size = 'small' }) {
  const list = Array.from({ length: rungs }, (_, index) => index) // [0, 1, 2, ...]
  return (
    <div className={`dna-helix helix-${size}`} aria-hidden="true">
      {list.map(index => (
        <span key={index} className="dna-rung" style={{ animationDelay: `${index * -0.2}s` }} />
      ))}
    </div>
  )
}

// 2) LiveClock — choto ekta "live" dot + ghonta:minit, 1 second por por update hoy
// Alada component rakha hoyeche, jate shudhu clock ta re-render hoy, pura page na.
export function LiveClock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000) // 1 second por por
    return () => clearInterval(timer) // component chole gele timer bondho
  }, [])

  return (
    <span className="live-status" title="System online">
      <span className="live-dot" />
      {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
    </span>
  )
}

// 3) ScrollProgress — upore ekta teal bar, page koto tuku scroll hoyeche dekhay
// + onek niche gele "back to top" button ashe.
export function ScrollProgress() {
  const [percent, setPercent] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      setPercent(maxScroll > 0 ? (window.scrollY / maxScroll) * 100 : 0)
    }
    onScroll() // prothom bar o ekbar hishab kori
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <div className="scroll-progress" style={{ width: `${percent}%` }} />
      {percent > 20 && (
        <button
          type="button"
          className="back-to-top"
          aria-label="Back to top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          ↑
        </button>
      )}
    </>
  )
}
