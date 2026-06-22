import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'

function readSource(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

describe('user-facing error alerts', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps oversized backend errors compact in the global alert component', () => {
    const appStore = useAppStore()
    const backendStack = [
      '### Error updating database.',
      'Cause: java.sql.SQLSyntaxErrorException: Table does not exist',
      'bad SQL grammar',
      'x'.repeat(600),
    ].join('\n')

    appStore.showNotification({ type: 'error', message: backendStack })

    expect(appStore.notifications).toHaveLength(1)
    expect(appStore.notifications[0].message.length).toBeLessThanOrEqual(260)
    expect(appStore.notifications[0].message).not.toContain('\n')
    expect(appStore.notifications[0].duration).toBeGreaterThanOrEqual(5000)
  })

  it('routes form and upload errors through global notifications instead of inline text blocks', () => {
    const iconUploadSource = readSource('../components/settings/IconUploadField.vue')
    const projectWizardSource = readSource('../components/dialogs/ProjectWizardDialog.vue')
    const layerControlSource = readSource('../modules/planning/panels/LayerControl.vue')
    const loginSource = readSource('../views/LoginView.vue')
    const importFileSource = readSource('../components/dialogs/ImportFileDialog.vue')
    const importExportSource = readSource('../components/dialogs/ImportExportDialog.vue')
    const notificationSource = readSource('../shared/components/feedback/Notification.vue')

    expect(iconUploadSource).toContain('appStore.showNotification')
    expect(iconUploadSource).not.toContain('uploadError')
    expect(projectWizardSource).not.toContain('{{ item.uploadError }}')
    expect(projectWizardSource).not.toContain('layer.uploadError = (error as Error).message')
    expect(layerControlSource).not.toContain('layerStore.platformLayersError')
    expect(loginSource).not.toContain('errorMessage')
    expect(importFileSource).not.toContain('resultMessage')
    expect(importExportSource).not.toContain('resultMessage')
    expect(notificationSource).toContain('break-words')
    expect(notificationSource).toContain('max-h-40')
  })
})
