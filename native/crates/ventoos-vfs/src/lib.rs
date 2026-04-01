pub(crate) mod ftp;
/// `VentoOS` Virtual File System.
///
/// Abstracts local, remote (SFTP/FTP/SMB), and object storage (S3)
/// into a unified path and node model.
pub mod manager;
pub mod routes;
pub(crate) mod s3;
pub mod sftp;
pub mod types;

pub use manager::VfsManager;
pub use routes::VfsPlugin;
pub use sftp::{SshAuth, SshConnInfo, SshInfoProvider};
pub use types::*;
