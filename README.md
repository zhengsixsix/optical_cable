# 海底光缆智能规划软件

前端项目，基于 Vue 3、Vite、Pinia、Vue Router、OpenLayers 和 Three.js。

## 后端

业务接口统一走线上平台后端。开发环境默认通过 Vite 将 `/platform-api` 代理到线上接口：

```text
http://47.92.110.176:9108
```

如需在部署环境中使用同源路径，请在 Web 服务层把 `/platform-api` 反向代理到同一线上后端。

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
npm run preview
```

## 目录

```text
src/            应用源码
public/image/   地图和设备图标
```

本地 DEM、共享 GIS 数据、构建产物、临时分析文件和旧 server 已从运行路径中移除。
