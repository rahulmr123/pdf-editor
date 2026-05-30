// Bundled fonts used by the "Document font" feature. Each is loaded as a
// browser FontFace for display and embedded (same .woff bytes) on export, so
// what you see matches what you get.
import robotoReg from '@fontsource/roboto/files/roboto-latin-400-normal.woff?url'
import robotoBold from '@fontsource/roboto/files/roboto-latin-700-normal.woff?url'
import loraReg from '@fontsource/lora/files/lora-latin-400-normal.woff?url'
import loraBold from '@fontsource/lora/files/lora-latin-700-normal.woff?url'
import monoReg from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url'
import monoBold from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff?url'

export const DOC_FONTS = {
  roboto: { label: 'Roboto (sans-serif)', family: 'Doc Roboto', category: 'sans', reg: robotoReg, bold: robotoBold },
  lora: { label: 'Lora (serif)', family: 'Doc Lora', category: 'serif', reg: loraReg, bold: loraBold },
  mono: { label: 'JetBrains Mono', family: 'Doc Mono', category: 'mono', reg: monoReg, bold: monoBold },
}

export const docFontCss = (key) => (DOC_FONTS[key] ? `"${DOC_FONTS[key].family}"` : '')

let registered = false
export function registerDocFonts() {
  if (registered || typeof document === 'undefined' || !document.fonts) return
  registered = true
  for (const f of Object.values(DOC_FONTS)) {
    try {
      const reg = new FontFace(f.family, `url(${f.reg})`, { weight: '400' })
      reg.load().then((x) => document.fonts.add(x)).catch(() => {})
      const bold = new FontFace(f.family, `url(${f.bold})`, { weight: '700' })
      bold.load().then((x) => document.fonts.add(x)).catch(() => {})
    } catch {}
  }
}

const bytesCache = {}
export async function getDocFontBytes(key, bold) {
  const f = DOC_FONTS[key]
  if (!f) return null
  const url = bold ? f.bold : f.reg
  if (url in bytesCache) return bytesCache[url]
  try {
    bytesCache[url] = new Uint8Array(await fetch(url).then((r) => r.arrayBuffer()))
  } catch {
    bytesCache[url] = null
  }
  return bytesCache[url]
}
