import { mkdirSync, writeFileSync } from 'node:fs'

const sampleRate = 22050
const duration = 42
const count = sampleRate * duration
const dataSize = count * 2
const buffer = Buffer.alloc(44 + dataSize)
buffer.write('RIFF', 0)
buffer.writeUInt32LE(36 + dataSize, 4)
buffer.write('WAVEfmt ', 8)
buffer.writeUInt32LE(16, 16)
buffer.writeUInt16LE(1, 20)
buffer.writeUInt16LE(1, 22)
buffer.writeUInt32LE(sampleRate, 24)
buffer.writeUInt32LE(sampleRate * 2, 28)
buffer.writeUInt16LE(2, 32)
buffer.writeUInt16LE(16, 34)
buffer.write('data', 36)
buffer.writeUInt32LE(dataSize, 40)

for (let index = 0; index < count; index += 1) {
  const time = index / sampleRate
  const envelope = Math.min(1, time / 2, (duration - time) / 2)
  const pulse = 0.65 + Math.sin(time * Math.PI * 0.18) * 0.12
  const value = (Math.sin(2 * Math.PI * 82.41 * time) * 0.55 + Math.sin(2 * Math.PI * 123.47 * time) * 0.22) * envelope * pulse
  buffer.writeInt16LE(Math.round(value * 1050), 44 + index * 2)
}

mkdirSync(new URL('../public/', import.meta.url), { recursive: true })
writeFileSync(new URL('../public/ambient.wav', import.meta.url), buffer)

