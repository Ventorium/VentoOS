use crate::error::VfsResult;
use crate::types::VfsMount;

use super::VfsDriver;
use super::VfsDriverContext;

/// Factory for creating driver instances from mount configuration.
///
/// Each backend submits one of these via `inventory::submit!` at compile time.
pub struct VfsDriverFactory {
    /// Unique driver name (e.g. "local", "sftp", "s3").
    pub name: &'static str,
    /// Constructor: receives mount config + shared context, returns a driver instance.
    pub create: fn(&VfsMount, &VfsDriverContext) -> VfsResult<Box<dyn VfsDriver>>,
}

inventory::collect!(VfsDriverFactory);
