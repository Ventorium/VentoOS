/**
 * Built-in Application Manifests
 *
 * Import this to get the full list of bundled apps and register them
 * with the kernel app registry via `registerApps(builtinManifests)`.
 */
import type { AppManifest } from '@/kernel'
import { aiAssistantManifest } from './ai-assistant/manifest'
import { databaseManifest } from './database/manifest'
import { explorerManifest } from './explorer/manifest'
import { fileViewerManifest } from './file-viewer/manifest'
import { kubernetesManifest } from './kubernetes/manifest'
import { redisManifest } from './redis/manifest'
import { settingsManifest } from './settings/manifest'
import { sshManifest } from './ssh/manifest'
import { terminalManifest } from './terminal/manifest'

export const builtinManifests: AppManifest[] = [
  kubernetesManifest,
  databaseManifest,
  redisManifest,
  explorerManifest,
  sshManifest,
  terminalManifest,
  aiAssistantManifest,
  settingsManifest,
  fileViewerManifest
]

export {
  aiAssistantManifest,
  databaseManifest,
  explorerManifest,
  fileViewerManifest,
  kubernetesManifest,
  redisManifest,
  settingsManifest,
  sshManifest,
  terminalManifest
}
