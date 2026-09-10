import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'

const color = { bg: '#091017', panel: '#0d161f', line: '#25323e', text: '#e8eef2', muted: '#91a0ad', mint: '#50e3b4', amber: '#f8bf47', coral: '#ff6b72', blue: '#71bfff' }

const base: CSSProperties = { fontFamily: 'Inter, Segoe UI, sans-serif', color: color.text }

function FadeScene({ children, duration }: { children: ReactNode; duration: number }) {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, 18, duration - 18, duration], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return <AbsoluteFill style={{ ...base, opacity, background: `radial-gradient(circle at 68% 42%, rgba(80,227,180,${0.035 + Math.sin(frame / 45) * 0.012}), transparent 40%), linear-gradient(145deg, #091017, #0b141c)` }}>{children}</AbsoluteFill>
}

function Rise({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const progress = spring({ frame: frame - delay, fps, config: { damping: 200 } })
  return <div style={{ opacity: progress, transform: `translateY(${(1 - progress) * 34}px)` }}>{children}</div>
}

function Hook() {
  return <FadeScene duration={150}><AbsoluteFill style={{ justifyContent: 'center', padding: '0 170px' }}><Rise><div style={{ color: color.mint, font: '600 28px IBM Plex Mono, monospace', marginBottom: 24 }}>BITGET AI TRADING DESK</div><h1 style={{ fontSize: 112, lineHeight: .98, letterSpacing: '-.055em', margin: 0, maxWidth: 1250 }}>24/7 markets.<br /><span style={{ color: color.amber }}>Partial information.</span></h1></Rise><Rise delay={18}><div style={{ width: 520, height: 3, background: color.mint, marginTop: 54, boxShadow: '0 0 26px rgba(80,227,180,.35)' }} /></Rise></AbsoluteFill></FadeScene>
}

function Problem() {
  const frame = useCurrentFrame()
  const rows = [['TOKEN', '01:16 UTC', color.mint], ['UNDERLYING', 'CLOSED', color.blue], ['NEWS', '03:42 UTC', color.coral]]
  return <FadeScene duration={180}><AbsoluteFill style={{ justifyContent: 'center', padding: '0 170px' }}><div style={{ display: 'grid', gridTemplateColumns: '44% 56%', alignItems: 'center' }}><Rise><div><div style={{ color: color.amber, fontSize: 28, marginBottom: 24 }}>THE PROBLEM</div><h2 style={{ fontSize: 78, lineHeight: 1.05, margin: 0 }}>A price gap is not<br />an explanation.</h2></div></Rise><div style={{ display: 'grid', gap: 18 }}>{rows.map(([label, value, accent], index) => { const p = spring({ frame: frame - 20 - index * 12, fps: 30, config: { damping: 200 } }); return <div key={label} style={{ opacity: p, transform: `translateX(${(1 - p) * 50}px)`, display: 'flex', justifyContent: 'space-between', border: `1px solid ${color.line}`, background: color.panel, padding: '28px 34px', font: '600 30px IBM Plex Mono, monospace' }}><span style={{ color: color.muted }}>{label}</span><span style={{ color: accent }}>{value}</span></div> })}</div></div></AbsoluteFill></FadeScene>
}

function BrowserFrame() {
  const frame = useCurrentFrame()
  const zoom = interpolate(frame, [0, 390], [1, 1.035], { extrapolateRight: 'clamp' })
  const callouts = [{ top: 160, text: 'Deterministic checks', accent: color.mint }, { top: 315, text: 'Explicit unknowns', accent: color.amber }, { top: 470, text: 'Source provenance', accent: color.blue }]
  return <FadeScene duration={420}><AbsoluteFill style={{ padding: '88px 110px', justifyContent: 'center' }}><div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 44, alignItems: 'center' }}><div style={{ border: `1px solid ${color.line}`, borderRadius: 16, overflow: 'hidden', background: '#071018', boxShadow: '0 35px 90px rgba(0,0,0,.38)', transform: `scale(${zoom})`, transformOrigin: 'center' }}><div style={{ height: 44, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderBottom: `1px solid ${color.line}` }}><i style={{ width: 12, height: 12, borderRadius: '50%', background: color.coral }} /><i style={{ width: 12, height: 12, borderRadius: '50%', background: color.amber }} /><i style={{ width: 12, height: 12, borderRadius: '50%', background: color.mint }} /><span style={{ marginLeft: 18, color: color.muted, font: '22px IBM Plex Mono, monospace' }}>bitget-market-integrity-desk.vercel.app</span></div><Img src={staticFile('video-ui.png')} style={{ width: '100%', display: 'block' }} /></div><div style={{ position: 'relative', height: 650 }}><div style={{ color: color.muted, fontSize: 28, marginTop: 40 }}>MARKET STATE PASSPORT</div>{callouts.map((item, index) => { const p = spring({ frame: frame - 50 - index * 34, fps: 30, config: { damping: 200 } }); return <div key={item.text} style={{ position: 'absolute', top: item.top, opacity: p, transform: `translateX(${(1 - p) * 28}px)`, borderLeft: `4px solid ${item.accent}`, padding: '16px 0 16px 24px', fontSize: 34, fontWeight: 700 }}>{item.text}</div> })}</div></div></AbsoluteFill></FadeScene>
}

function Boundary() {
  const items = [{ value: 'LIVE · RULES', label: 'Data and reasoning are separate', tone: color.blue }, { value: 'UNVERIFIABLE', label: 'Missing reference stays missing', tone: color.amber }, { value: 'NOT OBSERVABLE', label: 'No invented liquidity claim', tone: color.amber }]
  return <FadeScene duration={210}><AbsoluteFill style={{ justifyContent: 'center', padding: '0 150px' }}><Rise><h2 style={{ fontSize: 64, margin: '0 0 52px' }}>Honesty is a product feature.</h2></Rise><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>{items.map((item, index) => <Rise key={item.value} delay={18 + index * 10}><div style={{ minHeight: 210, border: `1px solid ${color.line}`, background: color.panel, padding: 34 }}><strong style={{ display: 'block', color: item.tone, font: '700 36px IBM Plex Mono, monospace', marginBottom: 34 }}>{item.value}</strong><span style={{ color: color.muted, fontSize: 29, lineHeight: 1.35 }}>{item.label}</span></div></Rise>)}</div></AbsoluteFill></FadeScene>
}

function Proof() {
  const steps = ['Observe', 'Verify', 'Investigate', 'Abstain']
  return <FadeScene duration={150}><AbsoluteFill style={{ justifyContent: 'center', padding: '0 150px' }}><Rise><div style={{ color: color.mint, fontSize: 30, marginBottom: 28 }}>OBSERVED DEVELOPER QA</div><h2 style={{ fontSize: 68, margin: '0 0 48px' }}>8/8 tests · Public live rToken</h2></Rise><div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>{steps.map((step, index) => <Rise key={step} delay={18 + index * 8}><div style={{ display: 'flex', alignItems: 'center', gap: 18 }}><span style={{ border: `1px solid ${color.line}`, background: color.panel, padding: '20px 28px', fontSize: 31 }}>{step}</span>{index < steps.length - 1 ? <span style={{ color: color.mint, fontSize: 38 }}>→</span> : null}</div></Rise>)}</div></AbsoluteFill></FadeScene>
}

function CTA() {
  return <FadeScene duration={150}><AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}><Rise><div style={{ color: color.mint, font: '600 28px IBM Plex Mono, monospace', marginBottom: 24 }}>MARKET INTEGRITY DESK</div><h2 style={{ fontSize: 76, margin: 0 }}>Try the live evidence desk</h2><div style={{ color: color.blue, font: '500 34px IBM Plex Mono, monospace', marginTop: 36 }}>bitget-market-integrity-desk.vercel.app</div><p style={{ color: color.muted, fontSize: 28, marginTop: 30 }}>Research only. Human decides.</p></Rise></AbsoluteFill></FadeScene>
}

export function MarketIntegrityDemo() {
  return <AbsoluteFill style={{ backgroundColor: color.bg }}><Audio src={staticFile('ambient.wav')} volume={0.42} /><Sequence from={0} durationInFrames={150} premountFor={30}><Hook /></Sequence><Sequence from={140} durationInFrames={180} premountFor={30}><Problem /></Sequence><Sequence from={310} durationInFrames={420} premountFor={30}><BrowserFrame /></Sequence><Sequence from={720} durationInFrames={210} premountFor={30}><Boundary /></Sequence><Sequence from={920} durationInFrames={150} premountFor={30}><Proof /></Sequence><Sequence from={1060} durationInFrames={200} premountFor={30}><CTA /></Sequence></AbsoluteFill>
}
