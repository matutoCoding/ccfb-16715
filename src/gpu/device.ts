// WebGPU 设备单例
let devicePromise: Promise<GPUDevice> | null = null
let adapterInfo: GPUAdapterInfo | null = null

export const gpu_available = (): boolean => typeof navigator !== "undefined" && "gpu" in navigator

export const get_device = (): Promise<GPUDevice> => {
  if (devicePromise) return devicePromise
  devicePromise = (async () => {
    if (!gpu_available()) throw new Error("当前浏览器不支持 WebGPU")
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) throw new Error("未找到可用的 GPU 适配器")
    adapterInfo = adapter.info ?? null
    return adapter.requestDevice()
  })()
  return devicePromise
}

export const get_adapter_info = (): GPUAdapterInfo | null => adapterInfo
