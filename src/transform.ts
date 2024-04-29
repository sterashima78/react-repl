import type { File, Store } from './store'
import { transform } from 'sucrase'

async function transformTS(src: string) {
  return transform(src, {
    transforms: ['typescript'],
  }).code
}
async function transformTSX(src: string) {
  return transform(src, {
    transforms: ['jsx', 'typescript'],
    jsxRuntime: 'automatic',
  }).code
}

export async function compileFile(
  _: Store,
  { filename, code, compiled }: File,
): Promise<(string | Error)[]> {
  if (!code.trim()) {
    return []
  }

  if (filename.endsWith('.css')) {
    compiled.css = code
    return []
  }

  if (filename.endsWith('.js') || filename.endsWith('.ts')) {
    if (filename.endsWith('.ts')) {
      code = await transformTS(code)
    }
    compiled.js = code
    return []
  }
  if (filename.endsWith('.jsx') || filename.endsWith('.tsx')) {
    code = await transformTSX(code)
    compiled.js = code
    return []
  }

  if (filename.endsWith('.json')) {
    let parsed
    try {
      parsed = JSON.parse(code)
    } catch (err: any) {
      console.error(`Error parsing ${filename}`, err.message)
      return [err.message]
    }
    compiled.js = `export default ${JSON.stringify(parsed)}`
    return []
  }

  return []
}
