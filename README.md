# 海底光缆智能规划软件

企业级重构版本，采用现代化技术栈。

## 技术栈

- **框架**: Vue 3.4+ (Composition API + `<script setup>`)
- **构建工具**: Vite 5.x
- **状态管理**: Pinia 2.x
- **路由**: Vue Router 4.x
- **UI 组件**: shadcn-vue 风格组件 + Tailwind CSS
- **地图引擎**: OpenLayers 10.x
- **3D 渲染**: Three.js 0.181.x
- **GeoTIFF 解析**: geotiff 2.x
- **类型检查**: TypeScript 5.x (strict mode)

## 项目结构

```
src/
├── components/          # 组件
│   ├── layout/         # 布局组件
│   ├── map/            # 地图组件
│   ├── panels/         # 面板组件
│   ├── ui/             # UI 基础组件
│   └── visualization/  # 可视化组件
├── lib/                # 工具库
├── repositories/       # 数据仓库层
│   ├── interfaces/     # 接口定义
│   └── mock/           # Mock 实现
├── router/             # 路由配置
├── stores/             # Pinia 状态管理
├── types/              # TypeScript 类型
├── utils/              # 工具函数
└── views/              # 页面视图
```

## 开始使用

### 1. 安装依赖

```bash
pnpm install
```

### 2. 复制数据文件

从原项目复制以下文件到 `public/` 目录：

- `dem.tif` - DEM 高程数据
- `output2.tif` - GeoTIFF 地图数据
- `data/` 目录 - Excel 数据文件

### 3. 启动开发服务器

```bash
pnpm dev
```

### 4. 构建生产版本

```bash
pnpm build
```

## 架构说明

### 分层架构

1. **Views** - 页面视图，组合各种组件
2. **Components** - UI 组件，负责展示
3. **Stores** - Pinia 状态管理
4. **Services** - 业务逻辑层（待实现）
5. **Repositories** - 数据访问层，支持 Mock 和真实 API 切换

### Repository 模式

项目采用 Repository 模式进行数据访问抽象：

```typescript
// 使用 Mock 实现
const layerRepo = createLayerRepository()
const layers = await layerRepo.getLayers()

// 未来切换到真实 API 只需修改工厂函数
```

### 状态管理

使用 Pinia 进行状态管理，分为以下 Store：

- `layerStore` - 图层状态
- `mapStore` - 地图状态
- `routeStore` - 路由规划状态
- `settingsStore` - 应用设置
- `appStore` - 全局应用状态

## 功能特性

- ✅ 三栏布局（左侧面板、中心地图、右侧面板）
- ✅ 图层控制（火山、地震、高程等）
- ✅ 地图框选区域分析
- ✅ 3D 地形渲染
- ✅ 水深剖面图
- ✅ 路由规划（基础）
- ✅ 工程设置
- ✅ 多视图切换
- 🚧 Pareto 路径优化
- 🚧 GIS 数据导入导出
- 🚧 浮动面板系统
