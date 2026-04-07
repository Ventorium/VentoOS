/**
 * Built-in Application Manifests
 *
 * Import this to get the full list of bundled apps and register them
 * with the kernel app registry via `registerApps(builtinManifests)`.
 */
import type { AppManifest } from '@/kernel'
import { aiAssistantManifest } from './ai-assistant/manifest'
import { archiveEditorManifest } from './archive-editor/manifest'
import { databaseManifest } from './database/manifest'
import { explorerManifest } from './explorer/manifest'
import { fileViewerManifest } from './file-viewer/manifest'
import { fontPreviewManifest } from './font-preview/manifest'
import { imageEditorManifest } from './image-editor/manifest'
import { kubernetesManifest } from './kubernetes/manifest'
import { logCenterManifest } from './log-center/manifest'
import { monitorManifest } from './monitor/manifest'
import { officeEditorManifest } from './office-editor/manifest'
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
  monitorManifest,
  settingsManifest,
  fileViewerManifest,
  logCenterManifest,
  imageEditorManifest,
  officeEditorManifest,
  archiveEditorManifest,
  fontPreviewManifest
]

export {
  aiAssistantManifest,
  archiveEditorManifest,
  databaseManifest,
  explorerManifest,
  fileViewerManifest,
  fontPreviewManifest,
  imageEditorManifest,
  kubernetesManifest,
  logCenterManifest,
  monitorManifest,
  officeEditorManifest,
  redisManifest,
  settingsManifest,
  sshManifest,
  terminalManifest
}
