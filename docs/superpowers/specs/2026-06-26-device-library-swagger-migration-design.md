# 器件库 Swagger 接口全量迁移说明

## 一、目标

把当前前端所有“器件库”相关逻辑统一改成 Swagger 文档里的接口模型。

后续前端不再把下面这些旧数组当作主数据来源：

- `fiberTypes`
- `amplifierTypes`
- `branchingUnitTypes`
- `equalizerTypes`
- `jointBoxTypes`

新的主模型只使用 Swagger 里的接口：

- `deviceLibrary`：器件库，表示项目里可用的概念器件、型号模板。
- `deviceEntity`：器件实例，表示系统规划中实际铺设的实物。
- `deviceConfig`：器件配置，表示某种设备类型有哪些动态属性字段。
- `deviceValue` / `deviceValueList`：器件属性值，保存某个器件库或器件实例在这些字段上的具体值。

## 二、核心业务关系

器件库是概念定义，器件实例是实物。

```text
deviceLibrary
  概念器件 / 型号模板
  定义这个型号的基础信息和属性值

deviceEntity
  实际铺设的器件实物
  引用 libraryId
  继承器件库属性
  扩展实物特有属性：经度、纬度、项目、排序等
```

动态属性由两部分组成：

```text
deviceConfig = 属性字段定义
deviceValue = 属性字段的具体值
```

例如：

```text
deviceConfig:
  name = 衰减系数
  code = attenuation
  unit = dB/km
  dataTypeCd = NUMBER

deviceValue:
  configCode = attenuation
  value = 0.16
```

合起来才是前端看到的一个完整属性。

## 三、设备类型标签规则

设备类型 tab 只从后端字典接口拿。

使用：

```text
/sys/dic/search/listItem
type = DEVICE_TYPE
```

处理规则：

- 字典返回什么设备类型，页面就显示什么 tab。
- 字典没有返回，就不显示假 tab。
- 不写死“光纤、放大器、分支器、均衡器、接头盒”作为兜底。
- 不写死 `FIB`、`AMP`、`BU`、`EQ`、`JB` 作为默认 tab。
- 如果字典为空，页面显示空状态，提示当前没有设备类型字典数据。

tab 的值直接使用字典项：

```text
tab label = dictionary.name
deviceTypeCd = dictionary.code
```

也就是说，前端不负责创造设备类型，只消费后端字典。

## 四、接口使用方式

### 1. 器件配置 deviceConfig

用于定义某个设备类型有哪些动态属性。

接口：

```text
/plan/deviceConfig/search
/plan/deviceConfig/save
/plan/deviceConfig/remove
/plan/deviceConfig/detail
```

查询时传：

```json
{
  "deviceTypeCd": "字典返回的 code"
}
```

返回的配置项用于动态渲染表单字段。

主要字段：

- `deviceTypeCd`：设备类型编码。
- `name`：属性名称。
- `code`：属性编码，也是 `deviceValueList[].configCode`。
- `dataTypeCd`：数据类型。
- `dataFormat`：数据格式。
- `dicCode`：字典编码。
- `defaultValue`：默认值。
- `unit`：单位。
- `groupCode`：分组编码。
- `groupName`：分组名称。
- `jsonField`：算法或 JSON 映射字段。

### 2. 器件库 deviceLibrary

用于维护概念器件或型号模板。

接口：

```text
/plan/deviceLibrary/search
/plan/deviceLibrary/save
/plan/deviceLibrary/remove
/plan/deviceLibrary/detail
```

保存时，基础信息和动态属性一起提交：

```json
{
  "id": null,
  "name": "G.654.E",
  "deviceTypeCd": "字典返回的 code",
  "iconId": null,
  "iconSize": {
    "width": 48,
    "height": 48
  },
  "dialogWindowId": null,
  "bindFuncList": [],
  "deviceValueList": [
    {
      "configCode": "attenuation",
      "value": "0.16"
    }
  ]
}
```

这里的 `deviceValueList` 表示这个型号自己的属性值。

### 3. 器件实例 deviceEntity

用于维护项目中实际铺设出来的实物。

接口：

```text
/plan/deviceEntity/search
/plan/deviceEntity/save
/plan/deviceEntity/remove
/plan/deviceEntity/detail
```

器件实例必须关联一个器件库：

```json
{
  "libraryId": 10
}
```

实例扩展实物属性：

- `name`
- `longitude`
- `latitude`
- `projectId`
- `sortNum`
- `iconId`
- `iconSize`
- `dialogWindowId`
- `bindFuncList`

创建实例时，先选择器件库，然后带出器件库的属性值。

保存实例时，把当前实例自己的属性值保存到 `deviceValueList`。

实例显示属性时，优先级是：

```text
实例 deviceValueList > 器件库 deviceValueList > deviceConfig.defaultValue
```

## 五、前端页面改造范围

### 1. `src/services/platform/types.ts`

补齐 Swagger 类型：

- `PlanDeviceConfig`
- `PlanDeviceConfigSearch`
- `PlanDeviceConfigSave`
- `PlanDeviceValue`
- `PlanDeviceValueSave`
- `PlanDeviceValueSimple`

扩展：

- `PlanDeviceLibrary.deviceValueList`
- `PlanDeviceEntity.deviceValueList`
- `PlanDeviceLibrary.projectId`

### 2. `src/services/platform/api.ts`

增加：

- `platformDeviceConfigApi`
- `platformDeviceValueApi`

更新：

- `platformDeviceLibraryApi`
- `platformDeviceEntityApi`
- `platformEndpointDefinitions`

默认 payload 要按 Swagger 文档字段写，不再使用旧的本地字段。

### 3. `src/stores/settings.ts`

器件库相关状态改成平台模型。

旧数组不再作为器件库模块的主状态：

```text
fiberTypes
amplifierTypes
branchingUnitTypes
equalizerTypes
jointBoxTypes
```

新的状态围绕这些数据：

- 设备类型字典列表。
- 当前选中的 `deviceTypeCd`。
- 当前类型的 `deviceConfig` 列表。
- 当前类型的 `deviceLibrary` 列表。
- 当前器件库下的 `deviceEntity` 列表。
- 详情接口返回的 `deviceValueList`。

### 4. `src/views/DeviceLibraryView.vue`

这个页面改成真正的平台器件库管理页。

页面结构：

- 顶部工具栏：刷新、新增器件库、导入、导出。
- 左侧或顶部 tab：从设备类型字典生成。
- 中间：当前设备类型下的器件库列表。
- 右侧或下方：选中器件库详情和器件实例列表。
- 新增/编辑器件库：使用动态属性表单。
- 新增/编辑器件实例：选择器件库，继承属性，填写坐标等实物字段。

### 5. `src/views/SettingsView.vue`

设置页里的“器件库配置”也改成同一套模型。

不要在 `DeviceLibraryView.vue` 和 `SettingsView.vue` 里各写一套不同逻辑。

如果重复代码太多，就抽公共组件：

- `DeviceTypeTabs`
- `DeviceDynamicValueForm`
- `DeviceLibraryEditor`
- `DeviceEntityEditor`

## 六、新增器件 UI 参考

从 git 历史里找到了旧界面：

- `b6e58bb:src/views/DeviceLibraryView.vue`
- `7560bde:src/components/dialogs/FiberTypeDialog.vue`
- `7560bde:src/components/dialogs/AmplifierTypeDialog.vue`
- `7560bde:src/components/dialogs/BranchingUnitTypeDialog.vue`
- 当前 `src/views/SettingsView.vue` 里也保留了“新增光纤器件”“新增放大器类型”等弹窗结构。

旧 UI 的可保留交互骨架：

```text
新增/编辑弹窗
  基础信息
  基础参数分组
  模型参数折叠区
  保存 / 取消
```

光纤旧界面示例：

```text
基础信息：
  器件名称
  光纤类型

基础物理参数：
  衰减系数
  色散系数
  色散斜率
  有效面积
  非线性折射率
  非线性系数

模型参数折叠区：
  GN 模型参数
  EGN 模型参数
  SSFM 模型参数
```

放大器旧界面示例：

```text
基础参数：
  额定增益
  噪声系数
  最大输出功率
  饱和功率
  平坦度
  单价

工作模式：
  固定增益
  固定输出功率
  APC

模型参数折叠区：
  EDFA Simple
  EDFA Full
```

新 UI 不再写死这些字段。

新 UI 使用相同结构，但字段来源改成：

```text
deviceConfig.groupName = 分组标题
deviceConfig.name = 字段名称
deviceConfig.unit = 单位
deviceConfig.dataTypeCd = 控件类型
deviceValue.value = 字段值
```

也就是说，旧界面只是视觉和交互参考，不再作为数据模型。

## 七、动态属性表单规则

根据 `deviceConfig.dataTypeCd` 选择控件：

- `NUMBER`：数字输入框。
- `STRING`：文本输入框。
- `BOOLEAN`：开关或复选框。
- `DATETIME`：日期时间输入。
- `DATA_TYPE`：如果有 `dicCode`，从字典加载选项。

根据 `groupCode/groupName` 分组展示。

如果没有分组，放到“基础参数”分组。

字段右侧显示 `unit`。

字段值来自：

```text
deviceValueList[configCode]
```

保存时转换回：

```json
[
  {
    "configCode": "attenuation",
    "value": "0.16"
  }
]
```

## 八、器件实例继承规则

新增器件实例时：

1. 用户选择器件库。
2. 前端调用 `/plan/deviceLibrary/detail`。
3. 读取器件库的 `deviceValueList`。
4. 调用 `/plan/deviceConfig/search` 获取字段定义。
5. 动态表单带出器件库属性值。
6. 用户填写实例名称、坐标、项目等实物属性。
7. 保存到 `/plan/deviceEntity/save`。

实例详情回显时：

1. 调用 `/plan/deviceEntity/detail`。
2. 根据 `libraryId` 调用 `/plan/deviceLibrary/detail`。
3. 根据 `deviceTypeCd` 调用 `/plan/deviceConfig/search`。
4. 合并出最终展示属性。

合并优先级：

```text
实例值 > 器件库值 > 配置默认值
```

## 九、导入导出

导入导出后续也按 Swagger 模型走。

导出结构应该围绕：

- `deviceLibrary`
- `deviceEntity`
- `deviceConfig`
- `deviceValueList`

不再导出旧的：

- `fiberTypes`
- `amplifierTypes`
- `branchingUnitTypes`
- `equalizerTypes`
- `jointBoxTypes`

如果需要兼容旧文件，只能作为一次性导入转换，不能继续作为运行时主模型。

## 十、对仿真、规划、SLD 的影响

原来很多地方从旧数组里取参数，例如光纤衰减、放大器噪声系数、分支器插损等。

迁移后要改成从 `deviceValueList` 取值。

需要新增一个参数解析层：

```text
Swagger 器件库数据
  -> deviceConfig + deviceValueList
  -> 领域参数
  -> 仿真 / 规划 / SLD 使用
```

这样业务模块不直接关心后端字段结构。

## 十一、验证方式

至少执行：

```text
npm run build
```

重点手工验证：

- 字典为空时不显示假 tab。
- 字典有设备类型时，tab 只显示字典返回项。
- 切换 tab 后加载当前类型的 `deviceConfig`。
- 新增器件库时，动态属性表单正常出现。
- 保存器件库时，payload 包含 `deviceValueList`。
- 新增器件实例时，选择器件库后能继承属性。
- 保存器件实例时，payload 包含坐标和 `deviceValueList`。
- 器件实例详情显示实例属性、继承属性和坐标。
- 仿真、规划、SLD 读取参数不再依赖旧数组。

## 十二、不做的事情

本次不改后端接口。

本次不伪造设备类型数据。

本次不把旧 `fiberTypes/amplifierTypes` 继续包装成新接口。

本次不新增和 Swagger 不一致的前端字段作为接口 payload。
