// Значки трея: цветной круг 32×32 со сглаживанием. Запуск: node scripts/make-icons.mjs
import { crc32, deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const COLORS = { green: [0x6c, 0xc5, 0x8a], yellow: [0xd2, 0x99, 0x22], red: [0xf8, 0x51, 0x49], grey: [0x8b, 0x94, 0x9e] }
const SIZE = 32
const R = 12

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function png([r, g, b]) {
  const rows = []
  for (let y = 0; y < SIZE; y++) {
    const row = [0]
    for (let x = 0; x < SIZE; x++) {
      const d = Math.hypot(x + 0.5 - SIZE / 2, y + 0.5 - SIZE / 2)
      const a = Math.max(0, Math.min(1, R + 0.5 - d))
      row.push(r, g, b, Math.round(a * 255))
    }
    rows.push(Buffer.from(row))
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0))
  ])
}

for (const [name, rgb] of Object.entries(COLORS)) writeFileSync(`resources/tray/${name}.png`, png(rgb))
