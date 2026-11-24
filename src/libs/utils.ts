// 通用工具, 不依赖第三方库 (Node 测试可直接用)
export const uid = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export const fmt_num = (v: number, digits = 3): string => {
  if (!Number.isFinite(v)) return "-"
  if (v === 0) return "0"
  const av = Math.abs(v)
  if (av >= 1e6 || av < 1e-3) return v.toExponential(2)
  return v.toPrecision(digits).replace(/\.?0+$/, "").replace(/\.$/, "")
}

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v))

export const download_text = (filename: string, text: string, mime = "text/plain"): void => {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
