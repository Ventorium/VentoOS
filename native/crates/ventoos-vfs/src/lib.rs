pub(crate) mod ftp;
/// `VentoOS` Virtual File System.
///
/// Abstracts local, remote (SFTP/FTP/SMB/WebDAV), and object storage (S3)
/// into a unified path and node model.
pub mod manager;
pub mod routes;
pub(crate) mod s3;
pub(crate) mod smb;
pub mod sftp;
pub mod types;
pub(crate) mod webdav;
pub mod webdav_server;
#[cfg(test)]
mod tests;

pub use manager::VfsManager;
pub use routes::VfsPlugin;
pub use sftp::{InlineSftpProvider, SshAuth, SshConnInfo, SshInfoProvider};
pub use types::*;
