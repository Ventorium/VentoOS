use crate::error::{VfsError, VfsResult};
use crate::types::VfsMount;

use super::config::VfsDriverFactory;
use super::VfsDriver;
use super::VfsDriverContext;

/// Global driver registry.
///
/// Drivers self-register via `inventory::submit!` at compile time.
/// No manual registration is needed — just compile the driver module in.
pub struct VfsDriverRegistry;

impl VfsDriverRegistry {
    /// Create a driver instance by name + mount config.
    pub fn create(
        name: &str,
        mount: &VfsMount,
        ctx: &VfsDriverContext,
    ) -> VfsResult<Box<dyn VfsDriver>> {
        for f in inventory::iter::<VfsDriverFactory> {
            if f.name == name {
                return (f.create)(mount, ctx);
            }
        }
        Err(VfsError::Other(format!(
            "Unknown driver '{name}'; registered: {:?}",
            Self::registered()
        )))
    }

    /// List all registered driver names.
    pub fn registered() -> Vec<&'static str> {
        let mut names: Vec<_> = inventory::iter::<VfsDriverFactory>
            .into_iter()
            .map(|f| f.name)
            .collect();
        names.sort_unstable();
        names
    }
}
