-- Add local FUSE mount configuration to vfs_mounts
ALTER TABLE vfs_mounts ADD COLUMN mount_config TEXT;
