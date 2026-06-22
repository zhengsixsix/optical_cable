import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

function routeBlock(sourceText: string, path: string, nextPath: string) {
  const start = sourceText.indexOf(`path: '${path}'`)
  const end = sourceText.indexOf(`path: '${nextPath}'`, start)
  return sourceText.slice(start, end)
}

function guardBlock(sourceText: string, condition: string, nextCondition: string) {
  const start = sourceText.indexOf(condition)
  const end = sourceText.indexOf(nextCondition, start)
  return sourceText.slice(start, end)
}

describe('transmission system planning access', () => {
  it('allows opening the design page for debugging without route data', () => {
    const routerSource = source('../router/index.ts')
    const designRoute = routeBlock(routerSource, '/design', '/monitoring')
    const designGuard = guardBlock(routerSource, "if (to.name === 'design')", "if (to.name === 'monitoring')")

    expect(designRoute).not.toContain('requiresUSE: true')
    expect(designGuard).toContain("appStore.setProjectPhase('transmission-planning')")
    expect(designGuard).not.toContain('routeStore')
    expect(designGuard).not.toContain("next({name: 'planning'})")
  })

  it('keeps the transmission planning menu visible from the planning menu', () => {
    const headerSource = source('../components/layout/AppHeader.vue')

    expect(headerSource).toContain('to="/design"')
    expect(headerSource).not.toContain('<RouterLink v-if="showTransmissionMenu" to="/design"')
  })
})
