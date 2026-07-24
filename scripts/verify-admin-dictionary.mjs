import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(process.cwd(), 'src/modules/admin/views/AdminDictionaryView.vue'), 'utf8')
const failures = []

if (!source.includes("const DICTIONARY_TYPE_SOURCE = 'DIC_TYPE'")) {
  failures.push('AdminDictionaryView must use DIC_TYPE as the dictionary type source.')
}

if (!source.includes('dictionaryStore.loadDictionary(DICTIONARY_TYPE_SOURCE')) {
  failures.push('AdminDictionaryView must load left-side dictionary types through the unified dictionary store.')
}

if (/const\s+typeOptions\s*=\s*\[[\s\S]*?PLAN_TYPE[\s\S]*?\]/.test(source)) {
  failures.push('AdminDictionaryView still contains hard-coded dictionary type options.')
}

if (!source.includes('activeTypeOptions')) {
  failures.push('AdminDictionaryView must derive form select options from loaded dictionary types.')
}

if (!source.includes('isFormDialogOpen')) {
  failures.push('AdminDictionaryView must use a dialog for the dictionary item form.')
}

if (!source.includes('openCreateDialog') || !source.includes('openEditDialog')) {
  failures.push('AdminDictionaryView must expose create and edit actions for the right-side content list.')
}

if (!source.includes('fixed inset-0')) {
  failures.push('AdminDictionaryView must render the dictionary item form as an overlay dialog.')
}

if (source.includes('业务可选项') || source.includes('allSelectableItems')) {
  failures.push('AdminDictionaryView must not render a separate business options list.')
}

if (/grid-cols-\[[^\]]*_360px\]/.test(source)) {
  failures.push('AdminDictionaryView must not reserve a permanent right-side form column.')
}

if (!source.includes('dictionary-layout')) {
  failures.push('AdminDictionaryView must use the explicit two-column dictionary-layout class.')
}

if (source.includes('grid-cols-[260px_minmax(0,1fr)]')) {
  failures.push('AdminDictionaryView still uses the arbitrary grid class that failed to render as two columns.')
}

if (!source.includes('dictionary-dialog')) {
  failures.push('AdminDictionaryView must use an explicit dictionary-dialog width constraint for the form modal.')
}

if (source.includes('max-w-[520px]')) {
  failures.push('AdminDictionaryView must not rely on the arbitrary max-w modal class that rendered full width.')
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('Admin dictionary checks passed.')
