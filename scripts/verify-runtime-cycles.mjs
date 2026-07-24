import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const sourceRoot = resolve(root, 'src')
const isWindows = process.platform === 'win32'

const pathKey = filePath => {
  const absolutePath = resolve(filePath)
  return isWindows ? absolutePath.toLowerCase() : absolutePath
}

const displayPath = filePath => relative(root, filePath).split(sep).join('/')

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectSourceFiles(entryPath))
    } else if (
      entry.isFile()
      && (entry.name.endsWith('.vue') || (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')))
    ) {
      files.push(entryPath)
    }
  }

  return files
}

function extractScriptSource(filePath, source) {
  if (!filePath.endsWith('.vue')) return source

  const scriptBlocks = []
  const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi
  let match
  while ((match = scriptPattern.exec(source)) !== null) {
    scriptBlocks.push(match[1])
  }
  return scriptBlocks.join('\n')
}

function isIdentifierStart(character) {
  return /[A-Za-z_$]/.test(character)
}

function isIdentifierPart(character) {
  return /[A-Za-z0-9_$]/.test(character)
}

function canStartRegularExpression(previousToken) {
  if (!previousToken) return true
  if (previousToken.type === 'identifier') {
    return ['case', 'delete', 'return', 'throw', 'typeof', 'void', 'yield'].includes(previousToken.value)
  }
  return ['(', '[', '{', ',', ';', ':', '=', '!', '?', '&', '|'].includes(previousToken.value)
}

function tokenize(source) {
  const tokens = []
  let index = 0

  while (index < source.length) {
    const character = source[index]

    if (/\s/.test(character)) {
      index += 1
      continue
    }

    if (character === '/' && source[index + 1] === '/') {
      index += 2
      while (index < source.length && source[index] !== '\n') index += 1
      continue
    }

    if (character === '/' && source[index + 1] === '*') {
      index += 2
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1
      index += 2
      continue
    }

    if (character === '/' && canStartRegularExpression(tokens.at(-1))) {
      index += 1
      let inCharacterClass = false
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2
        } else if (source[index] === '[') {
          inCharacterClass = true
          index += 1
        } else if (source[index] === ']') {
          inCharacterClass = false
          index += 1
        } else if (source[index] === '/' && !inCharacterClass) {
          index += 1
          while (/[A-Za-z]/.test(source[index] ?? '')) index += 1
          break
        } else {
          index += 1
        }
      }
      continue
    }

    if (character === '`') {
      index += 1
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2
        } else if (source[index] === '`') {
          index += 1
          break
        } else {
          index += 1
        }
      }
      continue
    }

    if (character === '"' || character === "'") {
      const quote = character
      let value = ''
      index += 1
      while (index < source.length && source[index] !== quote) {
        if (source[index] === '\\' && index + 1 < source.length) {
          value += source[index + 1]
          index += 2
        } else {
          value += source[index]
          index += 1
        }
      }
      if (source[index] === quote) index += 1
      tokens.push({ type: 'string', value })
      continue
    }

    if (isIdentifierStart(character)) {
      const start = index
      index += 1
      while (index < source.length && isIdentifierPart(source[index])) index += 1
      tokens.push({ type: 'identifier', value: source.slice(start, index) })
      continue
    }

    tokens.push({ type: 'punctuation', value: character })
    index += 1
  }

  return tokens
}

function findClosingBrace(tokens, openingIndex) {
  let depth = 0
  for (let index = openingIndex; index < tokens.length; index += 1) {
    if (tokens[index].value === '{') depth += 1
    if (tokens[index].value === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

function hasRuntimeNamedSpecifier(tokens, openingIndex, closingIndex) {
  const specifiers = []
  let current = []

  for (let index = openingIndex + 1; index < closingIndex; index += 1) {
    if (tokens[index].value === ',') {
      if (current.length > 0) specifiers.push(current)
      current = []
    } else {
      current.push(tokens[index])
    }
  }
  if (current.length > 0) specifiers.push(current)

  if (specifiers.length === 0) return true
  return specifiers.some(specifier => !(
    specifier.length > 1
    && specifier[0].value === 'type'
    && specifier[1].value !== 'as'
  ))
}

function findFromSpecifier(tokens, startIndex) {
  for (let index = startIndex; index < tokens.length; index += 1) {
    if (tokens[index].value === ';') return null
    if (
      tokens[index].type === 'identifier'
      && tokens[index].value === 'from'
      && tokens[index + 1]?.type === 'string'
    ) {
      return tokens[index + 1].value
    }
  }
  return null
}

function parseImport(tokens, importIndex) {
  const first = tokens[importIndex + 1]
  if (!first || first.value === '(' || first.value === '.' || first.value === 'type') return null
  if (first.type === 'string') return first.value

  if (first.value === '{') {
    const closingIndex = findClosingBrace(tokens, importIndex + 1)
    if (closingIndex < 0 || !hasRuntimeNamedSpecifier(tokens, importIndex + 1, closingIndex)) return null
    return findFromSpecifier(tokens, closingIndex + 1)
  }

  return findFromSpecifier(tokens, importIndex + 1)
}

function parseExport(tokens, exportIndex) {
  const first = tokens[exportIndex + 1]
  if (!first || first.value === 'type') return null

  if (first.value === '{') {
    const closingIndex = findClosingBrace(tokens, exportIndex + 1)
    if (closingIndex < 0 || !hasRuntimeNamedSpecifier(tokens, exportIndex + 1, closingIndex)) return null
    return findFromSpecifier(tokens, closingIndex + 1)
  }

  if (first.value === '*') return findFromSpecifier(tokens, exportIndex + 2)
  return null
}

function collectRuntimeSpecifiers(source) {
  const tokens = tokenize(source)
  const specifiers = []

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token.type !== 'identifier') continue

    const specifier = token.value === 'import'
      ? parseImport(tokens, index)
      : token.value === 'export'
        ? parseExport(tokens, index)
        : null

    if (specifier) specifiers.push(specifier)
  }

  return specifiers
}

function isInsideSourceRoot(filePath) {
  const pathFromSourceRoot = relative(sourceRoot, filePath)
  return !isAbsolute(pathFromSourceRoot)
    && pathFromSourceRoot !== '..'
    && !pathFromSourceRoot.startsWith(`..${sep}`)
}

function resolveLocalDependency(importer, specifier, fileByKey) {
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0]
  let basePath

  if (cleanSpecifier.startsWith('@/')) {
    basePath = resolve(sourceRoot, cleanSpecifier.slice(2))
  } else if (cleanSpecifier.startsWith('.')) {
    basePath = resolve(dirname(importer), cleanSpecifier)
  } else {
    return null
  }

  if (!isInsideSourceRoot(basePath)) return null

  const extension = extname(basePath)
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.vue`,
    resolve(basePath, 'index.ts'),
    resolve(basePath, 'index.vue'),
  ]
  if (['.js', '.mjs', '.cjs'].includes(extension)) {
    candidates.push(`${basePath.slice(0, -extension.length)}.ts`)
  }

  for (const candidate of candidates) {
    const matchedFile = fileByKey.get(pathKey(candidate))
    if (matchedFile) return matchedFile
  }
  return null
}

function findStronglyConnectedComponents(graph) {
  const indices = new Map()
  const lowLinks = new Map()
  const stack = []
  const onStack = new Set()
  const components = []
  let nextIndex = 0

  function visit(node) {
    indices.set(node, nextIndex)
    lowLinks.set(node, nextIndex)
    nextIndex += 1
    stack.push(node)
    onStack.add(node)

    for (const dependency of graph.get(node)) {
      if (!indices.has(dependency)) {
        visit(dependency)
        lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(dependency)))
      } else if (onStack.has(dependency)) {
        lowLinks.set(node, Math.min(lowLinks.get(node), indices.get(dependency)))
      }
    }

    if (lowLinks.get(node) !== indices.get(node)) return

    const component = []
    let member
    do {
      member = stack.pop()
      onStack.delete(member)
      component.push(member)
    } while (member !== node)
    components.push(component)
  }

  for (const node of graph.keys()) {
    if (!indices.has(node)) visit(node)
  }
  return components
}

function findCycleChain(component, graph) {
  const members = new Set(component)
  const orderedMembers = [...component].sort((left, right) => displayPath(left).localeCompare(displayPath(right)))

  for (const start of orderedMembers) {
    const path = [start]
    const inPath = new Set(path)

    function search(node) {
      const dependencies = [...graph.get(node)]
        .filter(dependency => members.has(dependency))
        .sort((left, right) => displayPath(left).localeCompare(displayPath(right)))

      for (const dependency of dependencies) {
        if (dependency === start) return [...path, start]
        if (inPath.has(dependency)) continue

        path.push(dependency)
        inPath.add(dependency)
        const cycle = search(dependency)
        if (cycle) return cycle
        inPath.delete(dependency)
        path.pop()
      }
      return null
    }

    const cycle = search(start)
    if (cycle) return cycle
  }

  return orderedMembers
}

const sourceFiles = await collectSourceFiles(sourceRoot)
const fileByKey = new Map(sourceFiles.map(filePath => [pathKey(filePath), filePath]))
const graph = new Map(sourceFiles.map(filePath => [filePath, new Set()]))

await Promise.all(sourceFiles.map(async filePath => {
  const source = extractScriptSource(filePath, await readFile(filePath, 'utf8'))
  for (const specifier of collectRuntimeSpecifiers(source)) {
    const dependency = resolveLocalDependency(filePath, specifier, fileByKey)
    if (dependency) graph.get(filePath).add(dependency)
  }
}))

const cyclicComponents = findStronglyConnectedComponents(graph)
  .filter(component => component.length > 1 || graph.get(component[0]).has(component[0]))
  .sort((left, right) => displayPath(left[0]).localeCompare(displayPath(right[0])))

const dependencyCount = [...graph.values()].reduce((total, dependencies) => total + dependencies.size, 0)

if (cyclicComponents.length === 0) {
  console.log(`Runtime cycle check passed (${sourceFiles.length} files, ${dependencyCount} local dependencies)`)
} else {
  console.error(`Runtime dependency cycles detected: ${cyclicComponents.length}`)
  cyclicComponents.forEach((component, index) => {
    const chain = findCycleChain(component, graph).map(displayPath).join(' -> ')
    console.error(`${index + 1}. ${chain}`)
  })
  process.exitCode = 1
}
