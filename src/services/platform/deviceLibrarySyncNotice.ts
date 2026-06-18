export interface DeviceLibrarySyncNotice {
  type: 'success' | 'warning'
  message: string
}

export function deviceLibrarySyncNotice(
  successMessage: string,
  syncError?: string | null,
  localOnlyMessage?: string,
): DeviceLibrarySyncNotice {
  if (syncError) {
    return {
      type: 'warning',
      message: `${localOnlyMessage || successMessage}，平台同步失败：${syncError}`,
    }
  }

  return {
    type: 'success',
    message: successMessage,
  }
}
