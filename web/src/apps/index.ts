/**
 * Built-in Application Manifests
 *
 * Import this to get the full list of bundled apps and register them
 * with the kernel app registry via `registerApps(builtinManifests)`.
 */
import type { AppManifest } from '@/kernel'
import { databaseManifest } from './database/manifest'
import { explorerManifest } from './explorer/manifest'
import { kubernetesManifest } from './kubernetes/manifest'
import { redisManifest } from './redis/manifest'
import { settingsManifest } from './settings/manifest'
import { sshManifest } from './ssh/manifest'

export const builtinManifests: AppManifest[] = [
  kubernetesManifest,
  databaseManifest,
  redisManifest,
  explorerManifest,
  sshManifest,
  settingsManifest
]

export { databaseManifest, explorerManifest, kubernetesManifest, redisManifest, settingsManifest, sshManifest }
