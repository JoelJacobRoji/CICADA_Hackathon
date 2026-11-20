// Parses every ```mermaid block in /docs with the real Mermaid parser (syntax check, not layout).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import mermaid from 'mermaid'

const DOCS = join(__dirname, '..', '..', '..', 'docs')

function mdFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? mdFiles(p) : p.endsWith('.md') ? [p] : []
  })
}

const blocks = mdFiles(DOCS).flatMap((f) =>
  [...readFileSync(f, 'utf8').matchAll(/```mermaid\r?\n([\s\S]*?)```/g)].map((m, i) => ({
    id: `${relative(DOCS, f)}#${i + 1}`,
    code: m[1] ?? '',
  })),
)

describe('docs mermaid diagrams', () => {
  it('finds diagrams', () => expect(blocks.length).toBeGreaterThan(0))
  it.each(blocks)('$id parses', async ({ code }) => {
    mermaid.initialize({ startOnLoad: false })
    await expect(mermaid.parse(code)).resolves.toBeTruthy()
  })
})
