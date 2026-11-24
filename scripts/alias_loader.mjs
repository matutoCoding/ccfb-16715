// Node ESM loader: 把 @/ 映射到 src/, 让物理模块可以在 Node 下直接测试
export const resolve = (specifier, context, next) => {
  if (specifier.startsWith("@/")) {
    return next(new URL(`../src/${specifier.slice(2)}`, import.meta.url).href, context)
  }
  return next(specifier, context)
}
