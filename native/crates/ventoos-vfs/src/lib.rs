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
pub(crate) mod smb;
pub mod sftp;
pub mod tail;
pub mod types;
pub mod watch;
pub(crate) mod webdav;
pub mod webdav_server;
#[cfg(test)]
mod tests;

pub use manager::VfsManager;
pub use routes::VfsPlugin;
pub use sftp::{InlineSftpProvider, SshAuth, SshConnInfo, SshInfoProvider};
pub use types::*;
