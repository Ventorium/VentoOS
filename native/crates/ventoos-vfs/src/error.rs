/// Unified error type for VFS operations.
#[derive(Debug, thiserror::Error)]
pub enum VfsError {
    #[error("Mount not found: {0}")]
    MountNotFound(String),
    #[error("Connection error: {0}")]
    ConnectionError(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Not supported: {0}")]
    NotImplemented(String),
    #[error("Invalid config: {0}")]
    InvalidConfig(String),
    #[error("{0}")]
    Other(String),
}

pub type VfsResult<T> = Result<T, VfsError>;

impl From<VfsError> for String {
    fn from(e: VfsError) -> String {
        e.to_string()
    }
}
