import fs = require('node:fs')
import path = require('node:path')

export interface CredentialsHealResult {
  changed: boolean
  file: string
}

type LogFn = (tag: string, message: string) => void

const NUMERIC_VERSION_LINE = /^(\uFEFF?version\s*:\s*)([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(\s*(?:#.*)?)$/m

function flattenLegacyCredentials(source: string): string | null {
  if (!/^refs\s*:\s*$/m.test(source)) return null
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const trailingEol = /\r?\n$/.test(source)
  const lines = source.split(/\r?\n/)
  const out: string[] = []
  let inRefs = false
  let changed = false

  for (const line of lines) {
    if (/^\uFEFF?version\s*:/.test(line)) {
      changed = true
      continue
    }
    if (/^refs\s*:\s*$/.test(line)) {
      inRefs = true
      changed = true
      continue
    }
    if (inRefs) {
      const entry = line.match(/^[ \t]+([A-Za-z_][A-Za-z0-9_]*\s*:.*)$/)
      if (entry) {
        out.push(entry[1]!)
        continue
      }
      if (line.trim() === '') continue
      inRefs = false
    }
    out.push(line)
  }

  if (!changed) return null
  const next = out.join(eol)
  return trailingEol && !next.endsWith(eol) ? next + eol : next
}

/**
 * credentials-local accepts a flat mapping of credential references to strings.
 * Older files may wrap entries under `refs` and carry a numeric `version`.
 * Migrate only that narrow legacy shape and leave secret values untouched.
 */
export function healCredentialsVersion(file: string, log: LogFn = () => {}): CredentialsHealResult {
  const target = path.resolve(file)
  let source: string
  try {
    source = fs.readFileSync(target, 'utf8')
  } catch {
    return { changed: false, file: target }
  }

  const legacy = flattenLegacyCredentials(source)
  const match = NUMERIC_VERSION_LINE.exec(source)
  if (!legacy && !match) return { changed: false, file: target }
  const next = legacy ?? (
    source.slice(0, match!.index)
      + `${match![1]}"${match![2]}"${match![3]}`
      + source.slice(match!.index + match![0].length)
  )
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`
  try {
    fs.writeFileSync(temp, next, { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(temp, target)
    log('credentials-heal', '已将旧版 credentials.yaml 迁移为扁平字符串映射')
    return { changed: true, file: target }
  } catch (error) {
    try { fs.rmSync(temp, { force: true }) } catch {}
    log('credentials-heal', `修复 credentials.yaml 的 version 失败: ${String((error as Error).message || error)}`)
    return { changed: false, file: target }
  }
}
