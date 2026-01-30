# 海缆路由规划系统 - 数据流架构文档

## 概述
本文档定义了系统中各 Store 的职责边界和数据流向规范。

## Store 职责定义

### 1. routeStore (路由规划)
**职责**: 管理 GIS 地图上的路由几何数据
**数据**: 路由点、线段、坐标、Pareto 前沿
**上游**: 无 (用户在地图上绘制)
**下游**: rplStore

```
用户绘制路由 → routeStore.currentRoute → rplStore.generateFromRoute()
```

### 2. rplStore (RPL 路由规划列表)
**职责**: 管理路由规划列表，记录路由上的关键点
**数据**: RPLTable, RPLRecord (KP、坐标、深度、光缆类型等)
**上游**: routeStore
**下游**: sldStore

```
routeStore.currentRoute → rplStore.currentTable → sldStore.generateFromRPL()
```

### 3. sldStore (系统线图)
**职责**: 管理设备拓扑和光纤连接
**数据**: SLDTable, SLDEquipment, SLDFiberSegment, 传输参数
**上游**: rplStore
**下游**: connectorStore

```
rplStore.currentTable → sldStore.currentTable → connectorStore.syncFromSLD()
```

### 4. connectorStore (接线元表)
**职责**: 管理物理连接器、接头盒等详细配置
**数据**: ConnectorTable, ConnectorElement (连接器规格、纤芯分配)
**上游**: sldStore
**下游**: monitorStore

```
sldStore.currentTable → connectorStore.currentTable → monitorStore.syncFromConnector()
```

### 5. monitorStore (监控设备)
**职责**: 管理运维阶段的设备监控状态和告警
**数据**: MonitorDevice, AlarmRecord (运行参数、状态)
**上游**: connectorStore (设备列表派生)
**下游**: 无

```
connectorStore.elements → monitorStore.devices (派生关系)
```

## 数据流向图

```
┌─────────────┐
│  用户绘制   │
└──────┬──────┘
       │
       ▼
┌─────────────┐     generateFromRoute()     ┌─────────────┐
│ routeStore  │ ──────────────────────────▶ │  rplStore   │
│ (几何路由)   │                             │ (路由列表)   │
└─────────────┘                             └──────┬──────┘
                                                   │
                                    generateFromRPL()
                                                   │
                                                   ▼
                                            ┌─────────────┐
                                            │  sldStore   │
                                            │ (设备拓扑)   │
                                            └──────┬──────┘
                                                   │
                                      syncFromSLD()
                                                   │
                                                   ▼
                                            ┌─────────────┐
                                            │connectorStore│
                                            │ (接线配置)   │
                                            └──────┬──────┘
                                                   │
                                    syncFromConnector() [派生]
                                                   │
                                                   ▼
                                            ┌─────────────┐
                                            │ monitorStore │
                                            │ (运维监控)   │
                                            └─────────────┘
```

## 数据联动规则

### 1. 单向流动原则
数据从上游 Store 流向下游 Store，**禁止逆向修改**。

- ✅ RPL 修改 → 自动同步到 SLD
- ❌ SLD 修改 → 不应该反向修改 RPL

### 2. KP (公里桩) 作为主键
所有设备/记录通过 `kp` 字段进行跨 Store 关联。

### 3. dataLinkService 事件类型
| 事件源 | action | 下游处理 |
|--------|--------|----------|
| rpl | add/update/delete | sld 同步设备 |
| sld | add/update/delete | connector 同步接线元 |
| connector | update | monitor 同步监控数据 |

### 4. 项目阶段与 Store 可编辑性
| 阶段 | routeStore | rplStore | sldStore | connectorStore | monitorStore |
|------|------------|----------|----------|----------------|--------------|
| 路由规划 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 传输规划 | ❌ | ✅ | ✅ | ❌ | ❌ |
| 详细设计 | ❌ | ❌ | ✅ | ✅ | ❌ |
| 运维监控 | ❌ | ❌ | ❌ | ❌ | ✅ (只读运行数据) |

## 派生关系实现

### Monitor 从 Connector 派生
monitorStore 的设备列表应该从 connectorStore 派生，而不是独立存储：

```typescript
// monitorStore 中
const devices = computed(() => {
  return connectorStore.elements.map(elem => ({
    id: elem.id,
    name: elem.name,
    type: elem.type,
    kp: elem.kp,
    longitude: elem.longitude,
    latitude: elem.latitude,
    depth: elem.depth,
    // 监控特有字段
    status: deviceStatus.value[elem.id] || 'normal',
    inputPower: realtimeData.value[elem.id]?.inputPower || 0,
    // ...
  }))
})
```

## 项目文件保存/加载

### 保存优先级
1. 保存原始编辑数据 (rplStore, sldStore, connectorStore)
2. 派生数据无需保存 (monitorStore.devices 从 connectorStore 计算)

### 加载顺序
1. 加载 routeStore (几何数据)
2. 加载 rplStore (路由列表)
3. 加载 sldStore (设备拓扑)
4. 加载 connectorStore (接线配置)
5. monitorStore 自动从 connectorStore 派生
