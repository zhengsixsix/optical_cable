# 器件库分层参数 UI 设计

## 背景

PDF 中要求器件参数分为两层：

- 器件模型参数：器件本身通用的物理属性，多数计算模型都会用到。
- 计算模型参数：某个计算模型额外需要的参数，用抽屉按模型组织，缺失时可在规划/计算过程中补充。

后端 Swagger 2.5-2.8 已提供四类接口：

- `deviceLibrary`：器件库，表示项目可用的概念器件或型号模板。
- `deviceEntity`：器件实例，表示实际铺设的实物，关联 `libraryId`，并扩展经纬度、项目、排序等字段。
- `deviceConfig`：器件动态属性配置，定义某设备类型有哪些字段。
- `deviceValue` / `deviceValueList`：器件动态属性值。

本次设计使用这些现有接口，不要求后端新增接口。

## 目标

把器件库 UI 改为 Swagger 平台模型，并满足 PDF 中“器件模型参数 + 计算模型参数抽屉”的体验。

核心目标：

- 设备类型 Tab 只来自 `DEVICE_TYPE` 字典，不写死光纤、放大器、BU 等类型。
- 器件库编辑时，按 `deviceConfig` 动态渲染基础参数和模型参数抽屉。
- 器件实例创建时，从器件库继承属性值，并允许覆盖实例自己的属性值。
- 保存器件库和器件实例时，统一提交 `deviceValueList`。
- 参数解析层能按 `jsonField` / `code` 为系统规划和仿真提供稳定取值入口。

## 接口映射

### 设备类型

设备类型来自：

```text
/sys/dic/search/listItem
type = DEVICE_TYPE
```

返回项映射：

- `dictionary.name` -> Tab 显示名
- `dictionary.code` -> `deviceTypeCd`

如果字典为空，页面显示空状态，不渲染默认假 Tab。

### 属性配置

属性定义来自：

```text
/plan/deviceConfig/search
```

查询条件：

```json
{
  "deviceTypeCd": "当前设备类型 code"
}
```

字段用法：

- `name`：字段显示名。
- `code`：属性编码，也是 `deviceValueList[].configCode`。
- `dataTypeCd`：控件类型，支持 `NUMBER`、`STRING`、`BOOLEAN`、`DATETIME`、`DATA_TYPE`。
- `dicCode`：当 `dataTypeCd = DATA_TYPE` 时加载字典选项。
- `unit`：字段单位。
- `defaultValue`：没有器件值时的默认值。
- `groupCode/groupName`：参数分组。用于表达基础参数和模型抽屉。
- `jsonField`：算法或仿真入参字段映射。

### 参数分层约定

前端不新增后端字段，通过 `groupCode/groupName` 组织 UI。

- 基础参数：`groupCode` 为空、`base`、`basic`、`device` 或 `device_model` 时，显示在“器件模型参数”分组。
- 模型参数：其他 `groupCode` 作为模型抽屉，例如 `GN`、`EGN`、`SSFM`、`EDFA_SIMPLE`。
- `groupName` 优先作为分组标题；没有时用 `groupCode`。

这样后端只需要维护动态属性配置，就能增加新器件类型和新计算模型。

### 器件库

器件库保存接口：

```text
/plan/deviceLibrary/save
```

保存 payload：

```json
{
  "id": null,
  "projectId": null,
  "name": "G.654.E",
  "deviceTypeCd": "FIB",
  "iconId": null,
  "iconSize": { "width": 48, "height": 48 },
  "dialogWindowId": null,
  "bindFuncList": [],
  "deviceValueList": [
    { "configCode": "attenuation", "value": "0.16" }
  ]
}
```

详情接口 `/plan/deviceLibrary/detail` 返回的 `deviceValueList` 用于回显属性值。

### 器件实例

器件实例保存接口：

```text
/plan/deviceEntity/save
```

实例必须关联 `libraryId`。

创建实例流程：

1. 用户选择器件库。
2. 前端调用 `/plan/deviceLibrary/detail`。
3. 前端读取器件库 `deviceValueList` 作为继承值。
4. 前端调用 `/plan/deviceConfig/search` 获取字段定义。
5. 表单显示继承属性、实例覆盖属性、经纬度、项目、排序等实物字段。
6. 保存到 `/plan/deviceEntity/save`。

实例属性显示优先级：

```text
实例 deviceValueList > 器件库 deviceValueList > deviceConfig.defaultValue
```

## UI 设计

### 页面结构

器件库页面分为四块：

- 顶部工具栏：刷新、新增器件库、属性配置管理、导入导出入口。
- 设备类型 Tab：来自 `DEVICE_TYPE` 字典。
- 器件库列表：展示当前类型下的器件型号、关键属性摘要、实例数量。
- 详情区域：展示选中器件库的属性分层、关联器件实例列表。

### 属性配置管理

属性配置管理用于维护 `deviceConfig`。

字段包括：

- 名称
- 编码
- 数据类型
- 单位
- 默认值
- 分组编码
- 分组名称
- 字典编码
- JSON 字段
- 描述

保存时调用 `/plan/deviceConfig/save`。

### 器件库编辑弹窗

弹窗分为：

- 基础信息：名称、设备类型、项目 ID、图标、参数窗口标识。
- 器件模型参数：基础属性分组。
- 计算模型参数抽屉：按模型分组折叠展示。

用户可以只填写基础参数，模型参数可以留空。

### 器件实例编辑弹窗

弹窗分为：

- 实物信息：名称、器件库、项目 ID、经纬度、排序、图标。
- 继承属性：默认带出器件库属性值。
- 实例覆盖：用户修改后保存到实例自己的 `deviceValueList`。

UI 需要标注属性来源：

- `器件库`
- `实例覆盖`
- `默认值`
- `未填写`

## 参数复用

当不同模型抽屉中存在名称和单位相同的参数时：

- 打开或初始化某个模型抽屉时，可从已填写的同名同单位参数中带入默认值。
- 复用只用于初始化，不建立强绑定。
- 用户修改一个抽屉中的参数，不影响其他抽屉。

## 参数解析层

新增或补强参数解析 helper，让业务模块不直接读取后端字段结构。

解析规则：

1. 将 `deviceConfig` 与 `deviceValueList` 合并为属性行。
2. 用 `jsonField` 作为算法字段优先映射。
3. `jsonField` 为空时用 `code`。
4. 取值优先级为实例值、器件库值、默认值。

这样系统规划和仿真只关心领域参数，不直接依赖 Swagger 原始结构。

## 错误和空状态

- `DEVICE_TYPE` 字典为空：显示“暂无设备类型字典数据”。
- 当前类型没有 `deviceConfig`：允许保存基础信息，但属性区域显示空状态。
- 当前字段无值且无默认值：显示为空，并在规划/计算参数校验中标记缺失。
- API 失败：保留当前页面状态并用通知提示失败原因。

## 测试与验证

自动验证：

- 动态属性 helper：值合并优先级、分组、`deviceValueList` 转换。
- 参数解析 helper：`jsonField` 优先、`code` 兜底、实例覆盖库值。
- 构建检查：`npm run build`。

手工验证：

- 字典为空时不出现默认假 Tab。
- 切换设备类型后重新加载 `deviceConfig` 和器件库。
- 新增器件库时能按分组显示基础参数和模型抽屉。
- 保存器件库 payload 包含 `deviceValueList`。
- 新增器件实例时能继承器件库属性。
- 保存器件实例 payload 包含 `libraryId`、坐标和 `deviceValueList`。

## 不做范围

- 不修改后端接口。
- 不一次性重写整个系统规划向导。
- 不把旧的 `fiberTypes/amplifierTypes/...` 继续作为器件库主数据。
- 不为设备类型写死固定枚举；设备类型由字典决定。
