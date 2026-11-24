// 米氏散射 WGSL 计算着色器: 与 CPU 参考实现同一套级数算法
// 每个 invocation 处理一个 (直径, 材料, 波长) 组合, 输出 Qsca/Qext 和 181 角度 i1/i2
export const MIE_WGSL = /* wgsl */ `
struct MieCase {
  d: f32,
  nre: f32,
  nim: f32,
  lam: f32,
  nmed: f32,
  pad0: f32,
  pad1: f32,
  pad2: f32,
}

@group(0) @binding(0) var<storage, read> cases: array<MieCase>;
@group(0) @binding(1) var<storage, read_write> outBuf: array<f32>;

const PI: f32 = 3.141592653589793;
const N_ANGLES: u32 = 181u;
const MAX_N: u32 = 256u;
const OUT_STRIDE: u32 = 2u + 2u * N_ANGLES;

fn cmul(a: vec2f, b: vec2f) -> vec2f {
  return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}
fn cdiv(a: vec2f, b: vec2f) -> vec2f {
  let den = b.x * b.x + b.y * b.y;
  return vec2f((a.x * b.x + a.y * b.y) / den, (a.y * b.x - a.x * b.y) / den);
}

@compute @workgroup_size(16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let ci = gid.x;
  if (ci >= arrayLength(&cases)) { return; }
  let c = cases[ci];
  let k = 2.0 * PI * c.nmed / c.lam;
  let x = k * c.d * 0.5;
  let m = vec2f(c.nre / c.nmed, c.nim / c.nmed);
  var nstop = u32(round(x + 4.0 * pow(x, 1.0 / 3.0) + 2.0));
  nstop = min(nstop, MAX_N - 2u);

  // D_n(mx) 向下递推
  var dArr: array<vec2f, 256>;
  let mx = vec2f(m.x * x, m.y * x);
  let nstart = min(nstop + 15u, MAX_N - 1u);
  dArr[nstart] = vec2f(0.0, 0.0);
  for (var n = nstart; n >= 1u; n--) {
    let nOverMx = cdiv(vec2f(f32(n), 0.0), mx);
    let denom = dArr[n] + nOverMx;
    dArr[n - 1u] = nOverMx - cdiv(vec2f(1.0, 0.0), denom);
  }

  // psi_n(x), chi_n(x) 向上递推
  var psi: array<f32, 256>;
  var chi: array<f32, 256>;
  var psiPrev = cos(x);
  var psiCur = sin(x);
  var chiPrev = -sin(x);
  var chiCur = cos(x);
  psi[0] = psiCur;
  chi[0] = chiCur;
  for (var n = 1u; n <= nstop; n++) {
    let fn2 = f32(2u * n - 1u) / x;
    let psiNext = fn2 * psiCur - psiPrev;
    let chiNext = fn2 * chiCur - chiPrev;
    psi[n] = psiNext;
    chi[n] = chiNext;
    psiPrev = psiCur;
    psiCur = psiNext;
    chiPrev = chiCur;
    chiCur = chiNext;
  }

  // 米氏系数 an, bn
  var an: array<vec2f, 256>;
  var bn: array<vec2f, 256>;
  let mInv = cdiv(vec2f(1.0, 0.0), m);
  for (var n = 1u; n <= nstop; n++) {
    let nOverX = f32(n) / x;
    let psiN = psi[n];
    let psiNm1 = psi[n - 1u];
    let xiN = vec2f(psi[n], -chi[n]);
    let xiNm1 = vec2f(psi[n - 1u], -chi[n - 1u]);
    let tA = cmul(dArr[n], mInv) + vec2f(nOverX, 0.0);
    an[n] = cdiv(tA * psiN - vec2f(psiNm1, 0.0), cmul(tA, xiN) - xiNm1);
    let tB = cmul(m, dArr[n]) + vec2f(nOverX, 0.0);
    bn[n] = cdiv(tB * psiN - vec2f(psiNm1, 0.0), cmul(tB, xiN) - xiNm1);
  }

  // 效率因子
  var qSca = 0.0;
  var qExt = 0.0;
  for (var n = 1u; n <= nstop; n++) {
    let w = f32(2u * n + 1u);
    qSca += w * (dot(an[n], an[n]) + dot(bn[n], bn[n]));
    qExt += w * (an[n].x + bn[n].x);
  }
  qSca = 2.0 / (x * x) * qSca;
  qExt = 2.0 / (x * x) * qExt;

  let base = ci * OUT_STRIDE;
  outBuf[base] = qSca;
  outBuf[base + 1u] = qExt;

  // 角分布: 每个角度做 pi/tau 递推并累加 S1, S2
  for (var j = 0u; j < N_ANGLES; j++) {
    let deg = 180.0 * f32(j) / f32(N_ANGLES - 1u);
    let mu = cos(deg * PI / 180.0);
    var s1 = vec2f(0.0, 0.0);
    var s2 = vec2f(0.0, 0.0);
    var piPrev = 0.0;
    var piCur = 1.0;
    for (var n = 1u; n <= nstop; n++) {
      let piN = piCur;
      let tauN = f32(n) * mu * piN - f32(n + 1u) * piPrev;
      let w = f32(2u * n + 1u) / (f32(n) * f32(n + 1u));
      s1 += w * (an[n] * piN + bn[n] * tauN);
      s2 += w * (an[n] * tauN + bn[n] * piN);
      let piNext = (f32(2u * n + 1u) * mu * piN - f32(n + 1u) * piPrev) / f32(n);
      piPrev = piN;
      piCur = piNext;
    }
    outBuf[base + 2u + 2u * j] = dot(s1, s1);
    outBuf[base + 3u + 2u * j] = dot(s2, s2);
  }
}
`
