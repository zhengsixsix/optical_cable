# 海底光缆系统重构计划

> 创建日期: 2026-01-29
> 状态: ✅ 已完成

## 一、重构目标

- 消除代码重复（components/ui 与 shared 重复）
- 统一 UI 组件使用（替换原生 input/select/button）
- 按功能域合并 Store（11个 → 6个）
- 模块化目录结构
- 清理无用代码（console.log ~100处）

## 二、目标目录结构

```
src/
├── modules/                     # 业务模块
│   ├── planning/               # 路由规划
│   │   ├── components/
│   │   ├── dialogs/
│   │   ├── panels/
│   │   ├── store.ts            # route + layer + map
│   │   └── index.ts
│   ├── design/                 # 系统设计
│   │   ├── components/
│   │   ├── dialogs/
│   │   ├── panels/
│   │   ├── store.ts            # sld + rpl + connector
│   │   └── index.ts
│   ├── monitoring/             # 监控
│   │   ├── components/
│   │   ├── store.ts
│   │   └── index.ts
│   └── device-library/         # 器件库
│       └── ...
├── shared/                      # 跨模块共享
│   ├── components/base/
│   ├── components/feedback/
│   ├── components/layout/
│   └── composables/
├── core/                        # 核心基础设施
│   └── stores/                 # app.ts, user.ts, project.ts
├── views/                       # 页面视图
└── router/
```

## 三、Store 合并方案

| 新 Store | 来源 | 位置 |
|----------|------|------|
| app.ts | app.ts 精简 | core/stores/ |
| user.ts | user.ts | core/stores/ |
| project.ts | projectData + app项目相关 | core/stores/ |
| planning.ts | route + layer + map | modules/planning/ |
| design.ts | sld + rpl + connector | modules/design/ |
| monitoring.ts | monitor | modules/monitoring/ |

settings.ts 拆分到各模块。Store间通信使用 useEventBus。

## 四、组件迁移映射

### 删除
- `components/ui/` 整个目录（与 shared/components/base 重复）

### Planning 模块
- components/map/MapArea.vue → modules/planning/components/
- components/map/RouteEditor.vue → modules/planning/components/
- components/panels/LayerControl.vue → modules/planning/panels/
- components/panels/LayerDetailPanel.vue → modules/planning/panels/
- components/panels/ParetoPanel.vue → modules/planning/panels/
- components/panels/RouteStats.vue → modules/planning/panels/
- components/dialogs/ImportGisDialog.vue → modules/planning/dialogs/
- components/dialogs/RouteEditDialog.vue → modules/planning/dialogs/
- components/dialogs/ParetoFrontierDialog.vue → modules/planning/dialogs/
- components/visualization/* → modules/planning/components/

### Design 模块
- components/map/SystemDesignMap.vue → modules/design/components/
- components/panels/SLDTablePanel.vue → modules/design/panels/
- components/panels/RPLTablePanel.vue → modules/design/panels/
- components/panels/ConnectorPanel.vue → modules/design/panels/
- components/panels/WDMConfigPanel.vue → modules/design/panels/
- components/dialogs/SLD*.vue → modules/design/dialogs/
- components/dialogs/RPL*.vue → modules/design/dialogs/
- components/dialogs/WDMConfigDialog.vue → modules/design/dialogs/
- components/dialogs/ConnectorDialog.vue → modules/design/dialogs/

### Monitoring 模块
- components/map/MonitoringMap.vue → modules/monitoring/components/
- components/panels/MonitorPanel.vue → modules/monitoring/panels/
- components/dialogs/AlarmManageDialog.vue → modules/monitoring/dialogs/

### Shared
- components/layout/AppHeader.vue → shared/components/layout/
- components/layout/MainLayout.vue → shared/components/layout/
- components/notifications/* → shared/components/feedback/

## 五、实施步骤

### 阶段 1：搭建新架构骨架 ✅
- [x] 1.1 创建 modules/ 子目录结构
- [x] 1.2 创建 core/stores/ 目录
- [x] 1.3 删除重复的 components/ui/ 目录

### 阶段 2：Store 合并 ✅
- [x] 2.1 创建 core/stores/app.ts (精简版)
- [x] 2.2 创建 core/stores/project.ts
- [x] 2.3 创建 modules/planning/store.ts
- [x] 2.4 创建 modules/design/store.ts
- [x] 2.5 创建 modules/monitoring/store.ts
- [x] 2.6 更新所有 store 引用

### 阶段 3：组件迁移 ✅
- [x] 3.1 迁移 planning 模块组件
- [x] 3.2 迁移 design 模块组件
- [x] 3.3 迁移 monitoring 模块组件
- [x] 3.4 更新 views 导入路径

### 阶段 4：代码清理 ✅
- [x] 4.1 删除重复 components/ui 目录
- [x] 4.2 更新导入路径 @/components/ui → @/shared/components/base
- [x] 4.3 修复编译错误 (LayerManager.ts, MapArea.vue)
- [x] 4.4 清理 console.log (已清理主要文件)
- [x] 4.5 删除空目录 (components/map, components/visualization)
- [x] 4.6 替换原生元素为 shared 组件

### 阶段 5：验证 ✅
- [x] 5.1 编译检查
- [x] 5.2 开发服务器启动测试
- [ ] 5.3 性能测试 (待后续)

## 六、风险与应对

| 风险 | 应对 |
|------|------|
| 迁移导致功能回归 | 每阶段完成后测试 |
| Store合并状态丢失 | 分步合并，保留备份 |
| 导入路径混乱 | 使用 @ 别名，批量替换 |
