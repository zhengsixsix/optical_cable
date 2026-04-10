import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const distDir = path.join(repoRoot, 'dist')
const tmpDir = path.join(repoRoot, 'tmp')
const envFilePath = path.join(repoRoot, '.env.deploy.local')
const isPostbuild = process.argv.includes('--from-postbuild')

const readEnvFile = (filePath) => {
  if (!existsSync(filePath)) return {}

  const content = readFileSync(filePath, 'utf8')
  const env = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const index = line.indexOf('=')
    if (index === -1) continue

    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    env[key] = value
  }

  return env
}

const envFile = readEnvFile(envFilePath)
const config = {
  ...envFile,
  ...process.env,
}

const asBool = (value, defaultValue = false) => {
  if (value == null || value === '') return defaultValue
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

if (isPostbuild && !asBool(config.DEPLOY_AFTER_BUILD, false)) {
  console.log('[deploy-bt] 跳过自动部署: DEPLOY_AFTER_BUILD 未开启')
  process.exit(0)
}

if (!existsSync(envFilePath)) {
  console.log('[deploy-bt] 跳过部署: 未找到 .env.deploy.local')
  process.exit(0)
}

if (!existsSync(distDir)) {
  console.error('[deploy-bt] 部署失败: dist 目录不存在，请先执行构建')
  process.exit(1)
}

const requiredKeys = ['DEPLOY_HOST', 'DEPLOY_USER', 'DEPLOY_REMOTE_PATH']
const missingKeys = requiredKeys.filter((key) => !config[key])
if (missingKeys.length > 0) {
  console.error(`[deploy-bt] 部署失败: 缺少配置 ${missingKeys.join(', ')}`)
  process.exit(1)
}

const remotePath = config.DEPLOY_REMOTE_PATH.trim()
const allowAnyPath = asBool(config.DEPLOY_ALLOW_ANY_PATH, false)
if (!allowAnyPath && !remotePath.startsWith('/www/wwwroot/')) {
  console.error('[deploy-bt] 出于安全考虑，DEPLOY_REMOTE_PATH 默认必须位于 /www/wwwroot/ 下')
  console.error('[deploy-bt] 如果你确认目标目录安全，可在 .env.deploy.local 里设置 DEPLOY_ALLOW_ANY_PATH=true')
  process.exit(1)
}

mkdirSync(tmpDir, { recursive: true })

const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const archivePath = path.join(tmpDir, `deploy-${timestamp}.tar.gz`)
const remoteTmpDir = config.DEPLOY_REMOTE_TMP_DIR?.trim() || `/tmp/${config.npm_package_name || 'vite-app'}`
const remoteArchive = `${remoteTmpDir}/deploy-${timestamp}.tar.gz`
const remoteExtractDir = `${remoteTmpDir}/extract-${timestamp}`
const port = config.DEPLOY_PORT?.trim() || '22'
const sshKey = config.DEPLOY_SSH_KEY?.trim()
const preserveItems = (config.DEPLOY_PRESERVE || '.user.ini,.well-known')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

const quote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

const sshCommonArgs = [
  '-o', 'StrictHostKeyChecking=accept-new',
  '-o', 'ServerAliveInterval=30',
  '-o', 'ServerAliveCountMax=6',
]

if (sshKey) {
  sshCommonArgs.push('-i', path.resolve(repoRoot, sshKey))
}

const sshTarget = `${config.DEPLOY_USER}@${config.DEPLOY_HOST}`
const findPreserveArgs = preserveItems.map((item) => `! -name ${quote(item)}`).join(' ')
const remoteScript = [
  'set -eu',
  `REMOTE_PATH=${quote(remotePath)}`,
  `TMP_DIR=${quote(remoteTmpDir)}`,
  `ARCHIVE=${quote(remoteArchive)}`,
  `EXTRACT_DIR=${quote(remoteExtractDir)}`,
  'mkdir -p "$TMP_DIR"',
  'mkdir -p "$REMOTE_PATH"',
  'rm -rf "$EXTRACT_DIR"',
  'mkdir -p "$EXTRACT_DIR"',
  'tar -xzf "$ARCHIVE" -C "$EXTRACT_DIR"',
  `find "$REMOTE_PATH" -mindepth 1 -maxdepth 1 ${findPreserveArgs} -exec rm -rf {} +`,
  'cp -a "$EXTRACT_DIR"/. "$REMOTE_PATH"/',
  'rm -rf "$EXTRACT_DIR" "$ARCHIVE"',
].join('\n')

console.log('[deploy-bt] 正在打包 dist 目录...')
run('tar', ['-czf', archivePath, '-C', distDir, '.'])

try {
  console.log(`[deploy-bt] 正在上传到 ${sshTarget}:${remotePath}`)
  run('ssh', [...sshCommonArgs, '-p', port, sshTarget, `mkdir -p ${quote(remoteTmpDir)}`])
  run('scp', [...sshCommonArgs, '-P', port, archivePath, `${sshTarget}:${remoteArchive}`])

  console.log('[deploy-bt] 正在远程解压并覆盖站点目录...')
  run('ssh', [...sshCommonArgs, '-p', port, sshTarget, remoteScript])

  console.log('[deploy-bt] 部署完成')
} finally {
  if (existsSync(archivePath)) {
    rmSync(archivePath, { force: true })
  }
}
