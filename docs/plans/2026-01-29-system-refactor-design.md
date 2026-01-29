# 海底光缆系统重构设计方案

> 创建日期: 2026-01-29
> 状态: 待实施

## 一、背景与目标

### 当前问题

1. **代码臃肿** - 无用代码未清理，console.log 有 126 处
2. **UI 不一致** - 23 个 Dialog、12 个 Panel 重复实现相同样式
3. **架构混乱** - app.ts 达 325 行，职责过多；Store 间存在交叉引用
4. **性能问题** - 首屏加载慢、地图交互卡顿、大数据渲染慢、3D 场景性能差

### 重构目标

- 架构清晰、模块解耦、方便后续迭代新功能
- 可接受大范围破坏性改动

---

## 二、技术方案

### 方案选型：模块化重构

按业务域划分模块，每个模块内聚（components + store + services + types）

---

## 三、目录结构设计

```
src/
├── modules/                    # 业务模块
│   ├── planning/              # 路由规划
│   │   ├── components/        # 模块专属组件
│   │   │   ├── MapArea.vue
│   │   │   ├── LayerControl.vue
│   │   │   ├── RouteStats.vue
│   │   │   └── ParetoPanel.vue
│   │   ├── dialogs/           # 模块对话框
│   │   │   ├── ImportGisDialog.vue
│   │   │   └── RouteEditDialog.vue
│   │   ├── store.ts           # 模块状态（合并 route + layer）
│   │   ├── services.ts        # 模块服务
│   │   ├── types.ts           # 模块类型
│   │   └── index.ts           # 模块入口
│   │
│   ├── design/                # 系统设计
│   │   ├── components/
│   │   ├── dialogs/
│   │   ├── store.ts           # 合并 sld + rpl + connector
│   │   └── ...
│   │
│   ├── monitoring/            # 监控模块
│   │   ├── components/
│   │   ├── store.ts
│   │   └── ...
│   │
│   └── device-library/        # 器件库
│       └── ...
│
├── shared/                    # 跨模块共享
│   ├── components/
│   │   ├── base/              # 基础组件
│   │   │   ├── Button.vue
│   │   │   ├── Card.vue
│   │   │   ├── Select.vue
│   │   │   ├── Switch.vue
│   │   │   ├── Checkbox.vue
│   │   │   ├── Input.vue
│   │   │   ├── Tag.vue
│   │   │   └── Tooltip.vue
│   │   ├── feedback/          # 反馈组件
│   │   │   ├── Dialog.vue
│   │   │   ├── Notification.vue
│   │   │   ├── Loading.vue
│   │   │   └── Confirm.vue
│   │   ├── form/              # 表单组件
│   │   │   ├── FormItem.vue
│   │   │   ├── FormGroup.vue
│   │   │   └── FileInput.vue
│   │   ├── data/              # 数据展示
│   │   │   ├── Table.vue
│   │   │   ├── List.vue
│   │   │   └── Empty.vue
│   │   └── layout/            # 布局组件
│   │       ├── Panel.vue
│   │       ├── PanelHeader.vue
│   │       └── SplitPane.vue
│   ├── composables/
│   │   ├── useDialog.ts
│   │   ├── useLoading.ts
│   │   ├── useForm.ts
│   │   └── usePagination.ts
│   └── utils/
│       ├── format.ts
│       ├── validate.ts
│       └── file.ts
│
└── core/                      # 核心基础设施
    ├── map/
    │   ├── MapEngine.ts
    │   ├── layers/
    │   │   ├── LayerManager.ts
    │   │   ├── BaseLayer.ts
    │   │   ├── RouteLayer.ts
    │   │   ├── GeoLayer.ts
    │   │   └── HeatmapLayer.ts
    │   ├── interactions/
    │   │   ├── DrawInteraction.ts
    │   │   ├── SelectInteraction.ts
    │   │   └── MeasureInteraction.ts
    │   └── utils/
    │       ├── projection.ts
    │       ├── geometry.ts
    │       └── style.ts
    ├── three/
    │   ├── SceneManager.ts
    │   ├── TerrainRenderer.ts
    │   ├── controls/
    │   └── loaders/
    ├── data/
    │   ├── DataSource.ts
    │   ├── sources/
    │   │   ├── MockDataSource.ts
    │   │   ├── ApiDataSource.ts
    │   │   └── FileDataSource.ts
    │   └── DataSourceFactory.ts
    └── stores/
        ├── app.ts             # 精简：通知 + 加载状态
        ├── user.ts
        └── project.ts
```

---

## 四、Store 重新划分

### 重构前（11 个 Store）

```
app(325行) + route + layer + map + sld + rpl + connector + monitor + settings + user + projectData
```

### 重构后

```
core/stores/              # 全局 Store（3个）
├── app.ts                # 通知 + 加载状态（约50行）
├── user.ts               # 用户认证
└── project.ts            # 项目管理

modules/planning/store.ts   # 路由规划 Store
├── routes, layers, selectedRoute, selectedSegment
├── paretoResults
└── panelVisibility: { layerInfo, routeStats, depthProfile, terrain3D }

modules/design/store.ts     # 系统设计 Store
├── sldData, rplData, connectors
├── equipment, wdmConfig
└── ...

modules/monitoring/store.ts  # 监控 Store
├── devices, alarms, performanceData
└── wsConnection

modules/device-library/store.ts  # 器件库 Store
└── devices, categories
```

### Store 间通信

```ts
// 跨模块通信用事件总线
const bus = useEventBus()
bus.emit('route:selected', routeId)
bus.on('route:selected', handleSelect)
```

---

## 五、性能优化策略

### A. 首屏加载优化

```ts
// vite.config.ts 分包
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-vue': ['vue', 'vue-router', 'pinia'],
        'vendor-map': ['ol'],
        'vendor-3d': ['three'],
        'vendor-utils': ['exceljs', 'jszip', 'xlsx'],
      }
    }
  }
}
```

### B. 地图交互优化

- 节流渲染（60fps）
- 图层按需加载
- 视口裁剪：只渲染可见区域数据

### C. 大数据渲染优化

- 虚拟滚动用于长列表
- WebWorker 处理计算密集任务（shp、geo、pareto）

### D. 3D 场景优化

- LOD 层级细节
- 视锥剔除
- 离屏时暂停渲染

---

## 六、组件重构示例

### 统一 Dialog 组件

```vue
<!-- shared/components/feedback/Dialog.vue -->
<script setup lang="ts">
interface Props {
  visible: boolean
  title: string
  icon?: Component
  width?: string
  closable?: boolean
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-overlay" @click.self="$emit('close')">
      <div :class="['dialog-content', widthClass]">
        <header class="dialog-header">
          <div class="dialog-title">
            <component :is="icon" v-if="icon" />
            <span>{{ title }}</span>
          </div>
          <button v-if="closable" @click="$emit('close')">
            <X />
          </button>
        </header>
        <main class="dialog-body">
          <slot />
        </main>
        <footer v-if="$slots.footer" class="dialog-footer">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>
```

### 代码量对比

- 重构前：每个对话框 150-350 行
- 重构后：每个对话框 50-100 行（减少 60%+）

---

## 七、无用代码清理

### 清理清单

| 类别 | 数量 | 处理方式 |
|------|------|----------|
| console.log/warn/error | 126 处 | 删除或替换为日志服务 |
| TODO/FIXME 注释 | 3 处 | 处理或删除 |
| 未使用的导入 | 待扫描 | TypeScript 严格模式报错 |
| 重复对话框代码 | ~800 行 | 统一 Dialog 后删除 |

### 配置严格检查

```json
// tsconfig.json
{
  "compilerOptions": {
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "strict": true
  }
}
```

### Logger 统一

```ts
// shared/utils/logger.ts
const logger = {
  debug: import.meta.env.DEV ? console.log : () => {},
  info: (msg: string) => appStore.addLog('INFO', msg),
  warn: (msg: string) => appStore.addLog('WARN', msg),
  error: (msg: string) => appStore.addLog('ERROR', msg),
}
```

---

## 八、实施步骤

### 阶段 1: 基础设施搭建

- 1.1 创建新目录结构
- 1.2 搭建 shared 组件库（Dialog、Panel、Form 等）
- 1.3 搭建 core 层（MapEngine、DataSource）
- 1.4 配置 vite 分包 + ESLint 规则

### 阶段 2: 核心模块迁移

- 2.1 迁移 planning 模块
  - 合并 route + layer store
  - 迁移 MapArea、LayerControl 等组件
  - 对话框改用统一 Dialog
- 2.2 迁移 design 模块
  - 合并 sld + rpl + connector store
  - 迁移相关组件
- 2.3 迁移 monitoring 模块
- 2.4 迁移 device-library 模块

### 阶段 3: 清理与优化

- 3.1 删除旧代码
- 3.2 清理 console.log（126处）
- 3.3 性能优化（懒加载、虚拟滚动）
- 3.4 3D 场景优化

### 阶段 4: 验证与收尾

- 4.1 功能回归测试
- 4.2 性能测试对比
- 4.3 文档更新

### 文件迁移映射表

| 原路径 | 新路径 |
|--------|--------|
| `components/ui/*` | `shared/components/base/*` |
| `components/dialogs/*` | `modules/*/dialogs/*` |
| `components/panels/*` | `modules/*/components/*` |
| `components/map/*` | `modules/planning/components/*` |
| `components/visualization/*` | `modules/planning/components/*` |
| `stores/route.ts` + `stores/layer.ts` | `modules/planning/store.ts` |
| `stores/sld.ts` + `stores/rpl.ts` + `stores/connector.ts` | `modules/design/store.ts` |
| `stores/monitor.ts` | `modules/monitoring/store.ts` |
| `stores/app.ts` | `core/stores/app.ts` + `core/stores/project.ts` |
| `repositories/mock/*` | `core/data/sources/MockDataSource.ts` |
| `services/*` | `modules/*/services.ts` 或 `core/*` |

---

## 九、风险与应对

| 风险 | 应对措施 |
|------|----------|
| 迁移过程中功能回归 | 每个模块迁移后立即测试 |
| Store 合并导致状态丢失 | 迁移前备份，分步合并 |
| 组件依赖关系复杂 | 先迁移 shared 层，再迁移业务模块 |

---

## 十、验收标准

- [ ] 新目录结构符合设计
- [ ] 所有 Dialog 使用统一基础组件
- [ ] 所有 Panel 使用统一基础组件
- [ ] Store 按功能域划分，app.ts < 100 行
- [ ] console.log 清理完毕
- [ ] 首屏加载时间减少 30%+
- [ ] 无 TypeScript 编译警告
