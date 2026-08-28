import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { healCredentialsVersion } from '../credentials-format-heal.js'

function tempFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-credentials-heal-'))
  const file = path.join(dir, '.credentials.yaml')
  fs.writeFileSync(file, content, 'utf8')
  return file
}

test('healCredentialsVersion flattens legacy refs without touching secrets', () => {
  const file = tempFile('version: 1\nrefs:\n  DEEPSEEK_API_KEY: secret-value\n')
  const result = healCredentialsVersion(file)

  assert.equal(result.changed, true)
  assert.equal(fs.readFileSync(file, 'utf8'), 'DEEPSEEK_API_KEY: secret-value\n')
})

test('healCredentialsVersion is idempotent for a flat string mapping', () => {
  const source = 'DEEPSEEK_API_KEY: secret-value\n'
  const file = tempFile(source)
  const result = healCredentialsVersion(file)

  assert.equal(result.changed, false)
  assert.equal(fs.readFileSync(file, 'utf8'), source)
})

test('healCredentialsVersion quotes a standalone numeric version', () => {
  const file = tempFile('version: 1\n')
  const result = healCredentialsVersion(file)

  assert.equal(result.changed, true)
  assert.equal(fs.readFileSync(file, 'utf8'), 'version: "1"\n')
})

test('healCredentialsVersion leaves non-numeric or nested version values unchanged', () => {
  for (const source of [
    'version: latest\n',
    'section:\n  version: 1\n',
  ]) {
    const file = tempFile(source)
    const result = healCredentialsVersion(file)
    assert.equal(result.changed, false)
    assert.equal(fs.readFileSync(file, 'utf8'), source)
  }
})
