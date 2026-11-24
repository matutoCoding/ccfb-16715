// 复数运算, vec2 风格: [re, im]
export type Cx = [number, number]

export const cx = (re: number, im = 0): Cx => [re, im]
export const cadd = (a: Cx, b: Cx): Cx => [a[0] + b[0], a[1] + b[1]]
export const csub = (a: Cx, b: Cx): Cx => [a[0] - b[0], a[1] - b[1]]
export const cmul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]
export const cdiv = (a: Cx, b: Cx): Cx => {
  const d = b[0] * b[0] + b[1] * b[1]
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]
}
export const cabs2 = (a: Cx): number => a[0] * a[0] + a[1] * a[1]
export const cscale = (a: Cx, s: number): Cx => [a[0] * s, a[1] * s]
