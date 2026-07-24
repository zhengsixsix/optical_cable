import type {
  FiberPairType,
  RPLPointType,
} from '@/types'

type SelectOption<T extends string = string> = { value: T; label: string }
type DescribedSelectOption<T extends string = string> = SelectOption<T> & { desc: string }

export const pointTypeOptions: SelectOption<RPLPointType>[] = []
export const fiberPairTypeOptions: SelectOption<FiberPairType>[] = []
export const fiberModelOptions: DescribedSelectOption[] = []
export const calculationModelOptions: SelectOption[] = []
