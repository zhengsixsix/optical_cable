# 海底光缆智能规划软件

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
