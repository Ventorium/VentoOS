pub mod archive;
pub mod chmod;
pub(crate) mod ftp;
pub(crate) mod k8s_pod;
/// `VentoOS` Virtual File System.
///
/// Abstracts local, remote (SFTP/FTP/SMB/WebDAV), and object storage (S3)
/// into a unified path and node model.
pub mod manager;
pub mod routes;
pub(crate) mod s3;
pub mod search;
pub mod sftp;
pub(crate) mod smb;
pub mod tail;
#[cfg(test)]
mod tests;
pub mod types;
pub mod watch;
pub(crate) mod webdav;
pub mod webdav_server;

pub use manager::VfsManager;
pub use routes::VfsPlugin;
pub use sftp::{InlineSftpProvider, SshAuth, SshConnInfo, SshInfoProvider};
pub use types::*;
