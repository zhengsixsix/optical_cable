import { describe, expect, it } from 'vitest'
import { generateMonitoringReportHtml } from '@/services/MonitoringReportService'

describe('MonitoringReportService', () => {
  it('renders topology, tables and prediction sections into export html', () => {
    const html = generateMonitoringReportHtml(
      {
        title: '监控分析报告',
        exportTime: '2026-04-10 10:00:00',
        systemHealth: 96.5,
        onlineDevices: 3,
        totalDevices: 4,
        activeAlarmCount: 1,
        devices: [
          {
            id: 'dev-1',
            name: 'Node-A',
            type: 'repeater',
            kp: 10,
            status: 'normal',
            inputPower: -12,
            outputPower: -8,
            temperature: 4.2,
            osnr: 18.6,
          },
          {
            id: 'dev-2',
            name: 'Node-B',
            type: 'branching-unit',
            kp: 35,
            status: 'warning',
            inputPower: -13,
            outputPower: -9,
            temperature: 5.4,
            osnr: 17.1,
          },
        ],
        alarms: [
          {
            id: 1,
            time: '2026-04-10 09:30:00',
            device: 'Node-B',
            level: 'warning',
            status: 'active',
            message: 'Power low',
          },
        ],
        interpolation: {
          enabled: true,
          method: 'Spline',
          maxGap: 12,
          confidence: 95,
        },
        prediction: {
          lstmEnabled: true,
          dynamicBaselineEnabled: true,
          lookbackWindow: 72,
          retrainHours: 24,
          forecastHours: 12,
          sensitivity: 85,
        },
        logs: [
          {
            time: '10:00:00',
            level: 'INFO',
            type: '系统日志',
            object: 'Node-B',
            content: 'Prediction refreshed',
          },
        ],
      },
      {
        overview: true,
        topology: true,
        devices: true,
        alarms: true,
        prediction: true,
        logs: true,
      },
    )

    expect(html).toContain('Node-A')
    expect(html).toContain('Node-B')
    expect(html).toContain('Power low')
    expect(html).toContain('Prediction refreshed')
    expect(html).toContain('<svg viewBox=')
  })
})
