// 整片晶圆暗场成像 WGSL: 背景雾度 + 缺陷 PSF 溅射, 全在计算着色器完成
export const IMAGING_WGSL = /* wgsl */ `
struct Params {
  width: u32,
  height: u32,
  count: u32,
  seed: u32,
  scale: f32,
  bg: f32,
  sigma: f32,
  noise: f32,
}

struct Inst {
  x: f32,
  y: f32,
  sig: f32,
  pad: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> insts: array<Inst>;
@group(0) @binding(2) var<storage, read_write> img: array<atomic<u32>>;

fn pcg(v: u32) -> u32 {
  var s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}

fn rand01(p: u32) -> f32 {
  return f32(pcg(p)) * (1.0 / 4294967296.0);
}

// 背景雾度底噪: 均值 bg, 高斯近似泊松涨落
@compute @workgroup_size(8, 8)
fn background(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let idx = gid.y * params.width + gid.x;
  let r1 = rand01(idx ^ (params.seed * 2654435761u));
  let r2 = rand01(idx * 2246822519u ^ params.seed);
  let g = sqrt(-2.0 * log(max(r1, 1e-7))) * cos(6.2831853 * r2);
  let v = max(params.bg + sqrt(max(params.bg, 1.0)) * g * params.noise, 0.0);
  atomicStore(&img[idx], u32(v * params.scale));
}

// 缺陷亮点溅射: 高斯 PSF
@compute @workgroup_size(64)
fn splat(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.count) { return; }
  let inst = insts[i];
  let r = i32(ceil(params.sigma * 3.0));
  let cx = i32(round(inst.x));
  let cy = i32(round(inst.y));
  let s2 = 2.0 * params.sigma * params.sigma;
  for (var dy = -r; dy <= r; dy++) {
    for (var dx = -r; dx <= r; dx++) {
      let px = cx + dx;
      let py = cy + dy;
      if (px < 0 || py < 0 || px >= i32(params.width) || py >= i32(params.height)) { continue; }
      let w = exp(-f32(dx * dx + dy * dy) / s2);
      let idx = u32(py) * params.width + u32(px);
      atomicAdd(&img[idx], u32(inst.sig * w * params.scale));
    }
  }
}
`
