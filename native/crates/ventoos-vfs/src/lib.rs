/// VentoOS Virtual File System.
///
/// Abstracts local, remote (SFTP/FTP/SMB), and object storage (S3)
/// into a unified path and node model.
pub mod manager;
pub mod types;

pub use manager::VfsManager;
pub use types::*;
