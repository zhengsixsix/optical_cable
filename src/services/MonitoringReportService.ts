export interface MonitoringReportDevice {
  id: string
  name: string
  type: string
  kp: number
  status: 'normal' | 'warning' | 'error'
  inputPower?: number
  outputPower?: number
  temperature?: number
  osnr?: number
  ber?: number
}

export interface MonitoringReportAlarm {
  id: number
  time: string
  device: string
  level: 'info' | 'warning' | 'error'
  status: 'active' | 'acknowledged' | 'cleared'
  message: string
}

export interface MonitoringInterpolationConfig {
  enabled: boolean
  method: string
  maxGap: number
  confidence: number
}

export interface MonitoringPredictionConfig {
  lstmEnabled: boolean
  dynamicBaselineEnabled: boolean
  lookbackWindow: number
  retrainHours: number
  forecastHours: number
  sensitivity: number
}

export interface MonitoringReportSections {
  overview: boolean
  topology: boolean
  devices: boolean
  alarms: boolean
  prediction: boolean
  logs: boolean
}

export interface MonitoringReportData {
  title: string
  exportTime: string
  systemHealth: number
  onlineDevices: number
  totalDevices: number
  activeAlarmCount: number
  devices: MonitoringReportDevice[]
  alarms: MonitoringReportAlarm[]
  interpolation: MonitoringInterpolationConfig
  prediction: MonitoringPredictionConfig
  logs: Array<{ time: string; level: string; type: string; object: string; content: string }>
}

const esc = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const statusColor = (status: 'normal' | 'warning' | 'error'): string => {
  if (status === 'error') return '#dc2626'
  if (status === 'warning') return '#d97706'
  return '#16a34a'
}

const renderTopologySvg = (devices: MonitoringReportDevice[]): string => {
  if (devices.length === 0) {
    return '<div class="empty">暂无拓扑数据</div>'
  }

  const sorted = [...devices].sort((a, b) => a.kp - b.kp)
  const width = 960
  const height = 220
  const left = 60
  const right = 60
  const usable = Math.max(width - left - right, 1)
  const maxKp = Math.max(...sorted.map(device => device.kp), 1)

  const lines = sorted.slice(0, -1).map((device, index) => {
    const next = sorted[index + 1]
    const x1 = left + (device.kp / maxKp) * usable
    const x2 = left + (next.kp / maxKp) * usable
    return `<line x1="${x1}" y1="110" x2="${x2}" y2="110" stroke="#94a3b8" stroke-width="4" stroke-linecap="round" />`
  }).join('')

  const nodes = sorted.map(device => {
    const x = left + (device.kp / maxKp) * usable
    const color = statusColor(device.status)
    return `
      <g transform="translate(${x},110)">
        <circle r="18" fill="${color}" opacity="0.12"></circle>
        <circle r="10" fill="${color}" stroke="#ffffff" stroke-width="2"></circle>
        <text x="0" y="-24" text-anchor="middle" font-size="12" fill="#0f172a">${esc(device.name)}</text>
        <text x="0" y="34" text-anchor="middle" font-size="10" fill="#475569">${esc(device.type)} / KP ${device.kp.toFixed(1)}</text>
      </g>
    `
  }).join('')

  return `
    <svg viewBox="0 0 ${width} ${height}" class="topology-svg" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="#f8fafc" />
      ${lines}
      ${nodes}
    </svg>
  `
}

const renderDeviceTable = (devices: MonitoringReportDevice[]): string => {
  if (devices.length === 0) return '<div class="empty">暂无设备数据</div>'
  const rows = devices
    .map(device => `
      <tr>
        <td>${esc(device.name)}</td>
        <td>${esc(device.type)}</td>
        <td>KP ${device.kp.toFixed(1)}</td>
        <td>${device.status}</td>
        <td>${device.inputPower?.toFixed(1) ?? '--'}</td>
        <td>${device.outputPower?.toFixed(1) ?? '--'}</td>
        <td>${device.temperature?.toFixed(1) ?? '--'}</td>
        <td>${device.osnr?.toFixed(1) ?? '--'}</td>
      </tr>
    `)
    .join('')

  return `
    <table class="report-table">
      <thead>
        <tr>
          <th>设备</th>
          <th>类型</th>
          <th>位置</th>
          <th>状态</th>
          <th>输入功率</th>
          <th>输出功率</th>
          <th>温度</th>
          <th>OSNR</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `
}

const renderAlarmTable = (alarms: MonitoringReportAlarm[]): string => {
  if (alarms.length === 0) return '<div class="empty">暂无告警记录</div>'
  const rows = alarms
    .map(alarm => `
      <tr>
        <td>${esc(alarm.time)}</td>
        <td>${esc(alarm.device)}</td>
        <td>${esc(alarm.level)}</td>
        <td>${esc(alarm.status)}</td>
        <td>${esc(alarm.message)}</td>
      </tr>
    `)
    .join('')

  return `
    <table class="report-table">
      <thead>
        <tr>
          <th>时间</th>
          <th>设备</th>
          <th>级别</th>
          <th>状态</th>
          <th>内容</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `
}

const renderLogTable = (logs: MonitoringReportData['logs']): string => {
  if (logs.length === 0) return '<div class="empty">暂无日志记录</div>'
  const rows = logs
    .slice(0, 30)
    .map(log => `
      <tr>
        <td>${esc(log.time)}</td>
        <td>${esc(log.level)}</td>
        <td>${esc(log.type)}</td>
        <td>${esc(log.object)}</td>
        <td>${esc(log.content)}</td>
      </tr>
    `)
    .join('')

  return `
    <table class="report-table">
      <thead>
        <tr>
          <th>时间</th>
          <th>级别</th>
          <th>类型</th>
          <th>对象</th>
          <th>内容</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `
}

export function generateMonitoringReportHtml(
  data: MonitoringReportData,
  sections: MonitoringReportSections,
): string {
  const blocks: string[] = []

  if (sections.overview) {
    blocks.push(`
      <section>
        <h2>运行总览</h2>
        <div class="kpi-grid">
          <div class="kpi-card"><div class="kpi-label">系统健康度</div><div class="kpi-value">${data.systemHealth.toFixed(1)}%</div></div>
          <div class="kpi-card"><div class="kpi-label">在线设备</div><div class="kpi-value">${data.onlineDevices}/${data.totalDevices}</div></div>
          <div class="kpi-card"><div class="kpi-label">活动告警</div><div class="kpi-value">${data.activeAlarmCount}</div></div>
        </div>
      </section>
    `)
  }

  if (sections.topology) {
    blocks.push(`
      <section>
        <h2>拓扑图</h2>
        ${renderTopologySvg(data.devices)}
      </section>
    `)
  }

  if (sections.devices) {
    blocks.push(`
      <section>
        <h2>设备数据</h2>
        ${renderDeviceTable(data.devices)}
      </section>
    `)
  }

  if (sections.alarms) {
    blocks.push(`
      <section>
        <h2>告警明细</h2>
        ${renderAlarmTable(data.alarms)}
      </section>
    `)
  }

  if (sections.prediction) {
    blocks.push(`
      <section>
        <h2>预测与基线配置</h2>
        <div class="config-grid">
          <div class="config-card">
            <h3>插值补全</h3>
            <p>状态: ${data.interpolation.enabled ? '启用' : '关闭'}</p>
            <p>方法: ${esc(data.interpolation.method)}</p>
            <p>最大缺失窗口: ${data.interpolation.maxGap} 个采样点</p>
            <p>置信度阈值: ${data.interpolation.confidence}%</p>
          </div>
          <div class="config-card">
            <h3>预测模型</h3>
            <p>LSTM: ${data.prediction.lstmEnabled ? '启用' : '关闭'}</p>
            <p>动态基线: ${data.prediction.dynamicBaselineEnabled ? '启用' : '关闭'}</p>
            <p>回看窗口: ${data.prediction.lookbackWindow} 小时</p>
            <p>重训练周期: ${data.prediction.retrainHours} 小时</p>
            <p>预测时长: ${data.prediction.forecastHours} 小时</p>
            <p>灵敏度: ${data.prediction.sensitivity}%</p>
          </div>
        </div>
      </section>
    `)
  }

  if (sections.logs) {
    blocks.push(`
      <section>
        <h2>日志样本</h2>
        ${renderLogTable(data.logs)}
      </section>
    `)
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>${esc(data.title)}</title>
  <style>
    body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
    .page { max-width: 1120px; margin: 0 auto; padding: 32px; }
    .hero { background: linear-gradient(135deg, #0f172a, #1d4ed8); color: #fff; border-radius: 24px; padding: 28px 32px; margin-bottom: 24px; }
    .hero h1 { margin: 0 0 8px; font-size: 28px; }
    .hero p { margin: 0; color: rgba(255,255,255,0.82); }
    section { background: #fff; border-radius: 20px; padding: 24px; margin-bottom: 20px; box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08); }
    h2 { margin: 0 0 16px; font-size: 20px; }
    h3 { margin: 0 0 12px; font-size: 15px; }
    .kpi-grid, .config-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
    .config-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .kpi-card, .config-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; }
    .kpi-label { color: #475569; font-size: 13px; }
    .kpi-value { font-size: 28px; font-weight: 700; margin-top: 8px; }
    .report-table { width: 100%; border-collapse: collapse; }
    .report-table th, .report-table td { border-bottom: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; font-size: 13px; vertical-align: top; }
    .report-table th { color: #475569; background: #f8fafc; }
    .topology-svg { width: 100%; height: auto; }
    .empty { padding: 18px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 14px; color: #64748b; }
    @media print {
      body { background: #fff; }
      section { box-shadow: none; border: 1px solid #e2e8f0; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="hero">
      <h1>${esc(data.title)}</h1>
      <p>导出时间: ${esc(data.exportTime)}</p>
    </div>
    ${blocks.join('\n')}
  </div>
</body>
</html>`
}
