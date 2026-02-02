# 路由规划模块增强设计文档

## 概述
本文档描述路由规划模块的功能增强，使其完全符合流程文档要求。

## 一、类型定义扩展

### 1.1 SLD 设备类型扩展
**文件**: `src/types/sld.ts`

```typescript
// SLDEquipment 接口新增字段
export interface SLDEquipment {
  // ... 现有字段 ...
  
  // BU 专用字段（新增）
  portLimit?: number        // 端口上限（用户预设约束，3或4）
  actualPortCount?: number  // 实际端口数（路由规划后由算法推导）
}
```

### 1.2 路径规划配置类型扩展
**文件**: `src/stores/settings.ts`

```typescript
// BU 配置接口（新增）
export interface BUConfig {
  id: string
  name: string
  lon: number
  lat: number
  portLimit: 3 | 4  // 端口上限
}

// 海缆铠装映射规则（新增）
export interface ArmorMapping {
  riskLevel: 'high' | 'medium' | 'low'
  riskThreshold: number      // 风险阈值
  cableTypeId: string        // 缆型ID（关联器件库）
  cableTypeName: string      // 缆型名称
  unitPrice: number          // 单价（千元/km）
}

// 冗余策略配置（新增）
export interface RedundancyConfig {
  enabled: boolean
  costLimitType: 'relative' | 'absolute'
  relativeCostPercent?: number  // 相对成本百分比（如30%）
  absoluteCostLimit?: number    // 绝对成本上限（万元）
}

// 扩展 RoutePlanningConfig
export interface RoutePlanningConfig {
  // ... 现有字段 ...
  
  // 新增字段
  buList?: BUConfig[]              // BU 配置列表
  armorMappings?: ArmorMapping[]   // 海缆铠装映射规则
  redundancyConfig?: RedundancyConfig  // 冗余策略配置
}
```

### 1.3 海缆段类型定义
**文件**: `src/types/cableSegment.ts`（新建）

```typescript
// 海缆段分段方式
export type SegmentMethod = 'fixed-length' | 'risk-based'

// 海缆段生成配置
export interface SegmentGenerateConfig {
  method: SegmentMethod
  // 固定长度分段参数
  targetLength?: number  // 目标海缆段长度(km)
  // 风险等级分段参数
  highRiskThreshold?: number  // 高风险阈值
  mediumRiskThreshold?: number  // 中风险阈值
  minLength?: number  // 最小长度(km)
  maxLength?: number  // 最大长度(km)
}

// 海缆段记录
export interface CableSegment {
  id: string
  startKp: number       // 起点里程(km)
  endKp: number         // 终点里程(km)
  length: number        // 长度(km)
  riskLevel: 'high' | 'medium' | 'low'
  cableTypeId: string   // 缆型ID
  cableTypeName: string // 缆型名称
  armorType: string     // 铠装类型
  slack: number         // 敷设余量(%)
  burialDepth: number   // 埋深(m)
  isLocked?: boolean    // 是否锁定配置
}
```

## 二、工程设置界面增强

### 2.1 网络拓扑与站点配置
**文件**: `src/views/SettingsView.vue`

在"路径规划配置"中新增：

**多点模式下显示 BU 列表配置：**
```
┌──────────────────────────────────────────────────────────────────┐
│ 【BU 列表】                                    [ + 新增 BU ]      │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │ 名称      经度        纬度        端口上限   操作            │   │
│ │────────────────────────────────────────────────────────────│   │
│ │ BU-01    121.8200    30.5100     [ 4 ▼ ]   [编辑] [删除]   │   │
│ │ BU-02    120.6500    28.2200     [ 3 ▼ ]   [编辑] [删除]   │   │
│ └────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

**数据绑定**:
- 存储到 `settingsStore.routePlanningConfig.buList`
- 路由规划后，BU 的 actualPortCount 写入 `sldStore`

### 2.2 海缆铠装预选
**文件**: `src/views/SettingsView.vue`

新增折叠面板：

```
┌──────────────────────────────────────────────────────────────────┐
│ ▼ 海缆铠装预选                                                    │
├──────────────────────────────────────────────────────────────────┤
│ 【风险等级 → 缆型映射规则】                                        │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │ 风险等级   风险值范围      选择缆型        单价              │   │
│ │────────────────────────────────────────────────────────────│   │
│ │ 高风险    风险 ≥ [ 3 ]    [ DA-01 ▼ ]    24.0 千元/km      │   │
│ │ 中风险    [ 2 ] ≤ 风险    [ SA-01 ▼ ]    19.5 千元/km      │   │
│ │ 低风险    风险 < [ 2 ]    [ LW-01 ▼ ]    15.0 千元/km      │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                   │
│ 💡 系统根据路由经过区域的风险值自动匹配对应铠装类型的海缆         │
└──────────────────────────────────────────────────────────────────┘
```

**数据绑定**:
- 存储到 `settingsStore.routePlanningConfig.armorMappings`
- 缆型下拉从器件库 `settingsStore.cableTypes` 获取

### 2.3 冗余策略配置
**文件**: `src/views/SettingsView.vue`

新增折叠面板（仅多点模式显示）：

```
┌──────────────────────────────────────────────────────────────────┐
│ ▼ 冗余策略配置                                                    │
├──────────────────────────────────────────────────────────────────┤
│ 是否添加冗余： (●) 是  (○) 否                                     │
│                                                                   │
│ ┌── 选择"是"时展开 ──────────────────────────────────────────┐   │
│ │ 【成本上限配置】                                             │   │
│ │                                                              │   │
│ │ (●) 相对成本上限                                             │   │
│ │     相对于最小生成树网络，允许增加 [ 30 ] % 的成本           │   │
│ │                                                              │   │
│ │ (○) 绝对成本上限                                             │   │
│ │     预计网络总建设预算不超过 [       ] 万元                  │   │
│ └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

**数据绑定**:
- 存储到 `settingsStore.routePlanningConfig.redundancyConfig`

## 三、海缆段生成功能

### 3.1 海缆段生成配置对话框
**文件**: `src/modules/planning/dialogs/CableSegmentGenerateDialog.vue`（新建）

**触发入口**: GIS 界面工具栏「生成海缆段」按钮

**界面结构**:
```
┌──────────────────────────────────────────────┐
│ 海缆段生成配置                         [×]   │
├──────────────────────────────────────────────┤
│ 请选择海缆段生成方式：                        │
│                                              │
│ (●) 固定长度分段                             │
│ (○) 基于风险等级分段                         │
│                                              │
│ ─────────────────────────────────────────── │
│                                              │
│ 目标海缆段长度： [ 2.0 ] km                  │
│                                              │
│ ─────────────────────────────────────────── │
│                                              │
│ 💡 说明：                                    │
│ · 缆型根据「工程设置」中的风险映射规则分配   │
│ · 余量与埋深由算法自动计算                   │
├──────────────────────────────────────────────┤
│           [ 取消 ]  [ 生成预览 ]             │
└──────────────────────────────────────────────┘
```

### 3.2 海缆段生成结果预览对话框
**文件**: `src/modules/planning/dialogs/CableSegmentPreviewDialog.vue`（新建）

**界面结构**:
```
┌─────────────────────────────────────────────────────────────────────┐
│ 海缆段生成 - 结果预览                                        [×]   │
├─────────────────────────────────────────────────────────────────────┤
│ 分段方式: 基于风险等级   路径ID: ROUTE_001   海缆段数量: 12 段     │
│                                                                     │
│ [ ⚙ 列显示配置 ]  [ 📍 在地图中查看 ]                               │
├─────────────────────────────────────────────────────────────────────┤
│ │分段ID│起点里程│终点里程│长度 │风险等级│缆型  │铠装  │余量 │埋深│ │
│ │──────│────────│────────│─────│────────│──────│──────│─────│────│ │
│ │S-001 │ 0.000  │ 1.850  │1.850│ 低风险 │LW-01 │轻铠  │3.2% │0.8m│ │
│ │S-002 │ 1.850  │ 3.200  │1.350│ 高风险 │DA-01 │双铠  │5.5% │1.5m│ │
│ │ ...  │        │        │     │        │      │      │     │    │ │
├─────────────────────────────────────────────────────────────────────┤
│ 【汇总统计】                                                        │
│ 高风险段: 3段, 4.25km (14.9%)   预估成本: 102.0千元                 │
│ 中风险段: 4段, 9.80km (34.4%)   预估成本: 191.1千元                 │
│ 低风险段: 5段, 14.45km (50.7%)  预估成本: 216.8千元                 │
│ 总计: 12段, 28.5km              总预估成本: 509.9千元               │
├─────────────────────────────────────────────────────────────────────┤
│              [ ← 返回修改参数 ]     [ ✔ 确认 ]                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 海缆段数据存储
**存储位置**: `rplStore` 或新建 `cableSegmentStore`

```typescript
// 海缆段 Store
export const useCableSegmentStore = defineStore('cableSegment', () => {
  const segments = ref<CableSegment[]>([])
  const generateConfig = ref<SegmentGenerateConfig | null>(null)
  
  function generateSegments(routeId: string, config: SegmentGenerateConfig) {
    // 根据配置生成海缆段
  }
  
  function updateSegment(id: string, updates: Partial<CableSegment>) {
    // 更新单个海缆段配置
  }
  
  return { segments, generateConfig, generateSegments, updateSegment }
})
```

## 四、数据流联动

### 4.1 路由规划阶段数据流
```
用户配置
  ├─ 登陆站位置 ──────────────→ settingsStore.routePlanningConfig
  ├─ BU位置/端口上限 ─────────→ settingsStore.routePlanningConfig.buList
  ├─ 海缆铠装预选 ────────────→ settingsStore.routePlanningConfig.armorMappings
  └─ 冗余策略 ────────────────→ settingsStore.routePlanningConfig.redundancyConfig
            │
            ▼
      [开始路由规划]
            │
            ▼
    路由规划算法
            │
            ├─ 路由几何数据 ────→ routeStore
            ├─ RPL数据 ─────────→ rplStore（无BU字段）
            └─ BU实际端口数 ────→ sldStore.equipment[].actualPortCount
```

### 4.2 海缆段生成数据流
```
    [生成海缆段]
         │
         ▼
  海缆段生成配置对话框
         │
         ├─ 分段方式
         └─ 分段参数
         │
         ▼
    海缆段生成算法
         │
         ├─ 读取: routeStore.currentRoute（路由几何）
         ├─ 读取: settingsStore.armorMappings（铠装映射）
         └─ 计算: 余量/埋深
         │
         ▼
  海缆段预览对话框
         │
    [确认入库]
         │
         ▼
  cableSegmentStore.segments
```

## 五、实现优先级

| 优先级 | 功能 | 预估工时 |
|-------|------|---------|
| P0 | 类型定义扩展（sld.ts, settings.ts） | 0.5h |
| P1 | 网络拓扑配置（BU列表） | 2h |
| P2 | 海缆铠装预选 | 2h |
| P3 | 冗余策略配置 | 1.5h |
| P4 | 海缆段生成配置对话框 | 3h |
| P5 | 海缆段预览对话框 | 3h |
| P6 | cableSegmentStore 及数据联动 | 2h |

**总预估**: 14h

## 六、验收标准

1. ✅ 多点模式下可配置 BU 位置和端口上限
2. ✅ 海缆铠装预选可配置风险阈值和缆型映射
3. ✅ 冗余策略支持相对/绝对成本上限
4. ✅ 海缆段生成支持固定长度和风险等级两种分段方式
5. ✅ 海缆段预览显示完整的分段信息和汇总统计
6. ✅ 路由规划后 BU 的实际端口数正确写入 SLD
7. ✅ 所有配置数据可正确保存到 USE 文件并恢复
