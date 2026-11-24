// GPU 晶圆暗场图渲染: 背景 + 溅射两个 dispatch, 读回 u32 像素
import { get_device } from "./device.ts"
import { IMAGING_WGSL } from "./imaging_wgsl.ts"

export interface ImageDefect {
  x: number // 像素坐标
  y: number
  sig: number // 信号电子数
}

export interface WaferImage {
  width: number
  height: number
  pixels: Uint32Array
  scale: number // 电子数 = pixel / scale
}

export const render_wafer_image = async (
  defects: ImageDefect[],
  size: number,
  bgElectrons: number,
  seed: number,
): Promise<WaferImage> => {
  const device = await get_device()
  const module = device.createShaderModule({ code: IMAGING_WGSL })
  const pipelineBg = device.createComputePipeline({
    layout: "auto",
    compute: { module, entryPoint: "background" },
  })
  const pipelineSplat = device.createComputePipeline({
    layout: "auto",
    compute: { module, entryPoint: "splat" },
  })

  // 定点缩放: 保证最大值不溢出 u32
  let maxSig = bgElectrons * 2
  for (const d of defects) maxSig = Math.max(maxSig, d.sig)
  const scale = 2e9 / Math.max(maxSig, 1)

  const params = new ArrayBuffer(32)
  const u32v = new Uint32Array(params)
  const f32v = new Float32Array(params)
  u32v[0] = size
  u32v[1] = size
  u32v[2] = defects.length
  u32v[3] = seed >>> 0
  f32v[4] = scale
  f32v[5] = bgElectrons
  f32v[6] = 1.6 // PSF sigma, 像素
  f32v[7] = 1.0 // 噪声幅度系数
  const paramBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  device.queue.writeBuffer(paramBuf, 0, params)

  const instData = new Float32Array(Math.max(defects.length, 1) * 4)
  defects.forEach((d, i) => instData.set([d.x, d.y, d.sig, 0], i * 4))
  const instBuf = device.createBuffer({
    size: instData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(instBuf, 0, instData)

  const imgSize = size * size * 4
  const imgBuf = device.createBuffer({ size: imgSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })
  const readBuf = device.createBuffer({ size: imgSize, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })

  const makeBind = (pipeline: GPUComputePipeline) =>
    device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: paramBuf } },
        { binding: 1, resource: { buffer: instBuf } },
        { binding: 2, resource: { buffer: imgBuf } },
      ],
    })
  const bindBg = makeBind(pipelineBg)
  const bindSplat = makeBind(pipelineSplat)

  const encoder = device.createCommandEncoder()
  {
    const pass = encoder.beginComputePass()
    pass.setPipeline(pipelineBg)
    pass.setBindGroup(0, bindBg)
    pass.dispatchWorkgroups(Math.ceil(size / 8), Math.ceil(size / 8))
    pass.end()
  }
  {
    const pass = encoder.beginComputePass()
    pass.setPipeline(pipelineSplat)
    pass.setBindGroup(0, bindSplat)
    pass.dispatchWorkgroups(Math.ceil(defects.length / 64))
    pass.end()
  }
  encoder.copyBufferToBuffer(imgBuf, 0, readBuf, 0, imgSize)
  device.queue.submit([encoder.finish()])

  await readBuf.mapAsync(GPUMapMode.READ)
  const pixels = new Uint32Array(readBuf.getMappedRange()).slice()
  readBuf.unmap()
  paramBuf.destroy()
  instBuf.destroy()
  imgBuf.destroy()
  readBuf.destroy()
  return { width: size, height: size, pixels, scale }
}
