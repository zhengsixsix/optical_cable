# Device Library Swagger Migration Design

## Goal

Migrate all device-library-related frontend logic to the platform Swagger model.
The frontend must stop treating `fiberTypes`, `amplifierTypes`, `branchingUnitTypes`, `equalizerTypes`, and `jointBoxTypes` as the primary device library model.

The platform model is:

- `deviceConfig`: dynamic attribute definition for a device type.
- `deviceValue`: concrete attribute value.
- `deviceLibrary`: conceptual device model/type used by a project.
- `deviceEntity`: physical planned device instance, based on a library item and extended with instance-only fields such as coordinates.

## Scope

Update all current device-library-related code paths that interact with platform data:

- Platform API types and endpoint wrappers.
- Platform device library and entity store logic.
- `DeviceLibraryView.vue`.
- The device library section inside `SettingsView.vue`.
- Call sites that read device-library parameters for planning, design, simulation, and SLD behavior.

Local import/export compatibility may remain only as a file conversion concern. It must not remain the primary runtime source of truth for platform-backed device libraries.

## Device Type Tabs

The UI tabs map to `deviceTypeCd`:

- Fiber: `FIB`
- Amplifier: `AMP`
- Branching unit: `BU`
- Equalizer: `EQ`
- Joint box: `JB`

The labels should come from dictionary data when available, with these codes as stable fallbacks.

## Data Flow

### Device Config

For a selected `deviceTypeCd`, load:

```text
/plan/deviceConfig/search
```

Use the returned configs to render dynamic fields. Field metadata includes:

- `name`
- `code`
- `dataTypeCd`
- `dataFormat`
- `dicCode`
- `defaultValue`
- `unit`
- `groupCode`
- `groupName`
- `jsonField`

`code` is the stable key used by `deviceValueList[].configCode`.

### Device Library

The library represents a conceptual device model.

List:

```text
/plan/deviceLibrary/search
```

Detail:

```text
/plan/deviceLibrary/detail
```

Save:

```text
/plan/deviceLibrary/save
```

Save payload includes base fields plus:

```json
{
  "deviceValueList": [
    {
      "configCode": "attenuation",
      "value": "0.16"
    }
  ]
}
```

The UI must merge `deviceConfig` metadata with `deviceValueList` values for display and editing.

### Device Entity

The entity represents a physical planned device instance.

It references a device library through `libraryId`, inherits the library attributes, and adds instance-only fields:

- `longitude`
- `latitude`
- `projectId`
- `sortNum`
- instance `name`
- instance icon/display fields when needed

List:

```text
/plan/deviceEntity/search
```

Detail:

```text
/plan/deviceEntity/detail
```

Save:

```text
/plan/deviceEntity/save
```

When creating an entity, the form loads the selected library detail and pre-fills dynamic attribute values from the library. When saving an entity, submit the current merged values in `deviceValueList` so the physical instance has its own persisted parameter snapshot.

Display priority:

```text
entity deviceValueList > library deviceValueList > deviceConfig.defaultValue
```

## Frontend Architecture

### Platform Types

Add Swagger-aligned types:

- `PlanDeviceConfig`
- `PlanDeviceConfigSearch`
- `PlanDeviceConfigSave`
- `PlanDeviceValue`
- `PlanDeviceValueSave`
- `PlanDeviceValueSimple`

Extend:

- `PlanDeviceLibrary.deviceValueList`
- `PlanDeviceEntity.deviceValueList`
- `PlanDeviceLibrary.projectId`

### API Wrappers

Add:

- `platformDeviceConfigApi.search`
- `platformDeviceConfigApi.save`
- `platformDeviceConfigApi.detail`
- `platformDeviceConfigApi.remove`
- `platformDeviceValueApi.search`
- `platformDeviceValueApi.save`
- `platformDeviceValueApi.detail`
- `platformDeviceValueApi.remove`

Keep existing device library and entity wrappers, but update default endpoint definitions to include `deviceValueList`.

### Attribute Helpers

Create a helper module for:

- Mapping config arrays to ordered form fields.
- Converting value lists to `{ [configCode]: value }`.
- Building `deviceValueList` save payloads.
- Resolving inherited entity values from config, library values, and entity values.
- Coercing input display type from `dataTypeCd`.

### Store

Update platform device store logic to:

- Load libraries from `/plan/deviceLibrary/search`.
- Load library detail before editing, so `deviceValueList` is present.
- Load configs by selected `deviceTypeCd`.
- Load entities by `libraryId` or `projectId`.
- Load entity detail before editing, so inherited and instance values can be merged.

### Views

`DeviceLibraryView.vue` becomes the primary platform-backed device library management screen.

`SettingsView.vue` device library section should use the same model and helpers. If duplicated UI becomes too large, extract shared components:

- `DeviceTypeTabs`
- `DeviceDynamicValueForm`
- `DeviceLibraryEditor`
- `DeviceEntityEditor`

## Existing Local Models

The old arrays are no longer the primary model:

- `fiberTypes`
- `amplifierTypes`
- `branchingUnitTypes`
- `equalizerTypes`
- `jointBoxTypes`

Code that still needs numeric simulation parameters should read them through a Swagger-backed parameter resolver. The resolver can expose domain-specific values such as attenuation or noise figure, but its source must be `deviceValueList`, not the old arrays.

## Validation

Run:

```text
npm run build
```

Where feasible, add or update focused unit tests for attribute merging and value-list conversion. If the current test setup is unavailable, validate through TypeScript build and manual inspection of the affected UI flows.

## Out Of Scope

- Backend schema changes.
- Changing Swagger endpoint contracts.
- Authentication behavior.
- Reworking unrelated project, layer, map, or SLD functionality beyond parameter read compatibility.
