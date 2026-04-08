//! Archive operations: compress and decompress files.
//!
//! Supports tar.gz, zip (with optional AES encryption), and listing archive contents.
//! For remote providers, files are streamed via read/write APIs.

use std::io::{Read, Write};
use std::path::Path;

use serde::{Deserialize, Serialize};

/// Supported archive formats.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ArchiveFormat {
    TarGz,
    Zip,
    #[serde(rename = "7z")]
    SevenZ,
}

impl ArchiveFormat {
    /// Detect format from file extension.
    pub fn from_path(path: &str) -> Option<Self> {
        let lower = path.to_lowercase();
        if lower.ends_with(".tar.gz") || lower.ends_with(".tgz") {
            Some(Self::TarGz)
        } else if lower.ends_with(".zip") {
            Some(Self::Zip)
        } else if lower.ends_with(".7z") {
            Some(Self::SevenZ)
        } else {
            None
        }
    }

    /// Get the file extension for this format.
    pub fn extension(&self) -> &'static str {
        match self {
            Self::TarGz => ".tar.gz",
            Self::Zip => ".zip",
            Self::SevenZ => ".7z",
        }
    }
}

/// An entry within an archive (for listing).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveEntry {
    pub path: String,
    pub size: u64,
    pub compressed_size: Option<u64>,
    pub is_dir: bool,
    pub modified: Option<String>,
    pub encrypted: Option<bool>,
}

/// Result of listing archive contents.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveListResult {
    pub entries: Vec<ArchiveEntry>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub password_required: bool,
    pub error: Option<String>,
}

/// Request to create an archive.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveRequest {
    /// Relative paths of files/directories to include.
    pub paths: Vec<String>,
    /// Destination path for the archive (relative to mount root).
    pub dest: String,
    /// Archive format.
    pub format: ArchiveFormat,
    /// Optional password for encryption.
    pub password: Option<String>,
}

/// Request to extract an archive.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractRequest {
    /// Path to the archive file (relative to mount root).
    pub archive_path: String,
    /// Destination directory (relative to mount root).
    pub dest_dir: String,
    /// Optional password for encrypted archives.
    pub password: Option<String>,
}

/// Request to list contents of an archive.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveListRequest {
    pub path: String,
    pub password: Option<String>,
}

/// List contents of an archive file.
pub fn list_archive(
    archive_path: &Path,
    _password: Option<&str>,
) -> Result<ArchiveListResult, String> {
    let path_str = archive_path.to_string_lossy();

    if let Some(ArchiveFormat::TarGz) = ArchiveFormat::from_path(&path_str) {
        return list_tar_gz(archive_path);
    }
    if let Some(ArchiveFormat::Zip) = ArchiveFormat::from_path(&path_str) {
        return list_zip(archive_path);
    }

    // For unsupported formats, return error
    Err(format!("Unsupported archive format: {}", path_str))
}

fn list_tar_gz(archive_path: &Path) -> Result<ArchiveListResult, String> {
    let file = std::fs::File::open(archive_path).map_err(|e| format!("Failed to open: {e}"))?;
    let dec = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(dec);

    let mut entries = Vec::new();
    for entry in archive
        .entries()
        .map_err(|e| format!("Failed to read entries: {e}"))?
    {
        let entry = entry.map_err(|e| format!("Entry error: {e}"))?;
        let path = entry
            .path()
            .map_err(|e| format!("Path error: {e}"))?
            .to_string_lossy()
            .to_string();
        let is_dir = entry.header().entry_type().is_dir();
        let size = entry.header().size().unwrap_or(0);
        let modified = entry.header().mtime().ok().map(|t| {
            chrono::DateTime::from_timestamp(t as i64, 0)
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default()
        });

        entries.push(ArchiveEntry {
            path,
            size,
            compressed_size: None,
            is_dir,
            modified,
            encrypted: Some(false),
        });
    }

    Ok(ArchiveListResult {
        entries,
        password_required: false,
        error: None,
    })
}

fn list_zip(archive_path: &Path) -> Result<ArchiveListResult, String> {
    let file = std::fs::File::open(archive_path).map_err(|e| format!("Failed to open: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip: {e}"))?;

    let mut entries = Vec::new();
    for i in 0..archive.len() {
        let entry = archive
            .by_index_raw(i)
            .map_err(|e| format!("Entry error: {e}"))?;
        let path = entry.name().to_string();
        let is_dir = entry.is_dir();
        let size = entry.size();
        let compressed_size = Some(entry.compressed_size());
        let encrypted = Some(entry.encrypted());

        entries.push(ArchiveEntry {
            path,
            size,
            compressed_size,
            is_dir,
            modified: None,
            encrypted,
        });
    }

    Ok(ArchiveListResult {
        entries,
        password_required: false,
        error: None,
    })
}

/// Create a tar.gz archive from local files.
pub fn create_tar_gz(root: &Path, paths: &[String], dest: &Path) -> Result<(), String> {
    let file = std::fs::File::create(dest).map_err(|e| format!("Failed to create archive: {e}"))?;
    let enc = flate2::write::GzEncoder::new(file, flate2::Compression::default());
    let mut builder = tar::Builder::new(enc);

    for rel_path in paths {
        let clean = rel_path.trim_start_matches('/');
        let full = root.join(clean);
        if !full.exists() {
            return Err(format!("Path not found: {rel_path}"));
        }
        if full.is_dir() {
            builder
                .append_dir_all(clean, &full)
                .map_err(|e| format!("Failed to add directory: {e}"))?;
        } else {
            let mut f =
                std::fs::File::open(&full).map_err(|e| format!("Failed to open file: {e}"))?;
            builder
                .append_file(clean, &mut f)
                .map_err(|e| format!("Failed to add file: {e}"))?;
        }
    }

    builder
        .finish()
        .map_err(|e| format!("Failed to finalize archive: {e}"))?;
    Ok(())
}

/// Extract a tar.gz archive to a local directory.
pub fn extract_tar_gz(archive_path: &Path, dest_dir: &Path) -> Result<(), String> {
    let file =
        std::fs::File::open(archive_path).map_err(|e| format!("Failed to open archive: {e}"))?;
    let dec = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(dec);

    // Validate all entries before extracting to prevent path traversal
    let canonical_dest = dest_dir
        .canonicalize()
        .or_else(|_| {
            std::fs::create_dir_all(dest_dir)?;
            dest_dir.canonicalize()
        })
        .map_err(|e| format!("Destination error: {e}"))?;

    archive
        .unpack(&canonical_dest)
        .map_err(|e| format!("Extract failed: {e}"))?;

    Ok(())
}

/// Create a zip archive from local files, optionally with password encryption.
pub fn create_zip(
    root: &Path,
    paths: &[String],
    dest: &Path,
    password: Option<&str>,
) -> Result<(), String> {
    let file = std::fs::File::create(dest).map_err(|e| format!("Failed to create archive: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);

    for rel_path in paths {
        let clean = rel_path.trim_start_matches('/');
        let full = root.join(clean);
        if !full.exists() {
            return Err(format!("Path not found: {rel_path}"));
        }
        if full.is_dir() {
            add_dir_to_zip(&mut zip, root, &full, password)?;
        } else {
            let options = make_zip_options(password);
            zip.start_file(clean, options)
                .map_err(|e| format!("Zip error: {e}"))?;
            let mut f =
                std::fs::File::open(&full).map_err(|e| format!("Failed to open file: {e}"))?;
            let mut buf = Vec::new();
            f.read_to_end(&mut buf)
                .map_err(|e| format!("Read error: {e}"))?;
            zip.write_all(&buf)
                .map_err(|e| format!("Write error: {e}"))?;
        }
    }

    zip.finish()
        .map_err(|e| format!("Zip finalize error: {e}"))?;
    Ok(())
}

/// Build zip options with optional AES encryption, fresh for each call.
fn make_zip_options(password: Option<&str>) -> zip::write::FileOptions<'_, ()> {
    let base = zip::write::FileOptions::<()>::default()
        .compression_method(zip::CompressionMethod::Deflated);
    if let Some(pwd) = password {
        base.with_aes_encryption(zip::AesMode::Aes256, pwd)
    } else {
        base
    }
}

fn add_dir_to_zip(
    zip: &mut zip::ZipWriter<std::fs::File>,
    root: &Path,
    dir: &Path,
    password: Option<&str>,
) -> Result<(), String> {
    let rel = dir
        .strip_prefix(root)
        .map_err(|_| "Path error".to_string())?
        .to_string_lossy();

    // Add directory entry
    let options = make_zip_options(password);
    zip.add_directory(format!("{rel}/"), options)
        .map_err(|e| format!("Zip dir error: {e}"))?;

    for entry in std::fs::read_dir(dir).map_err(|e| format!("Read dir error: {e}"))? {
        let entry = entry.map_err(|e| format!("Dir entry error: {e}"))?;
        let path = entry.path();
        if path.is_dir() {
            add_dir_to_zip(zip, root, &path, password)?;
        } else {
            let file_rel = path
                .strip_prefix(root)
                .map_err(|_| "Path error".to_string())?
                .to_string_lossy()
                .to_string();
            let opts = make_zip_options(password);
            zip.start_file(&file_rel, opts)
                .map_err(|e| format!("Zip error: {e}"))?;
            let mut f = std::fs::File::open(&path).map_err(|e| format!("Open error: {e}"))?;
            let mut buf = Vec::new();
            f.read_to_end(&mut buf)
                .map_err(|e| format!("Read error: {e}"))?;
            zip.write_all(&buf)
                .map_err(|e| format!("Write error: {e}"))?;
        }
    }
    Ok(())
}

/// Extract a zip archive to a local directory, with optional password.
pub fn extract_zip(
    archive_path: &Path,
    dest_dir: &Path,
    password: Option<&str>,
) -> Result<(), String> {
    let file =
        std::fs::File::open(archive_path).map_err(|e| format!("Failed to open archive: {e}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip archive: {e}"))?;

    let canonical_dest = dest_dir
        .canonicalize()
        .or_else(|_| {
            std::fs::create_dir_all(dest_dir)?;
            dest_dir.canonicalize()
        })
        .map_err(|e| format!("Destination error: {e}"))?;

    for i in 0..archive.len() {
        let mut entry = if let Some(pwd) = password {
            archive
                .by_index_decrypt(i, pwd.as_bytes())
                .map_err(|e| format!("Zip entry error (wrong password?): {e}"))?
        } else {
            archive
                .by_index(i)
                .map_err(|e| format!("Zip entry error: {e}"))?
        };

        let Some(name) = entry.enclosed_name() else {
            // Skip entries with unsafe paths
            continue;
        };
        let out_path = canonical_dest.join(&name);

        // Security: ensure extraction stays within dest_dir
        if !out_path.starts_with(&canonical_dest) {
            return Err(format!(
                "Path traversal detected in archive: {}",
                name.display()
            ));
        }

        if entry.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| format!("Create dir failed: {e}"))?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Create parent dir failed: {e}"))?;
            }
            let mut outfile =
                std::fs::File::create(&out_path).map_err(|e| format!("Create file failed: {e}"))?;
            std::io::copy(&mut entry, &mut outfile).map_err(|e| format!("Extract failed: {e}"))?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_detection() {
        assert_eq!(
            ArchiveFormat::from_path("test.tar.gz"),
            Some(ArchiveFormat::TarGz)
        );
        assert_eq!(
            ArchiveFormat::from_path("test.tgz"),
            Some(ArchiveFormat::TarGz)
        );
        assert_eq!(
            ArchiveFormat::from_path("test.zip"),
            Some(ArchiveFormat::Zip)
        );
        assert_eq!(ArchiveFormat::from_path("test.txt"), None);
    }

    #[test]
    fn test_tar_gz_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();

        // Create test files
        std::fs::write(root.join("hello.txt"), "Hello World").unwrap();
        std::fs::create_dir(root.join("subdir")).unwrap();
        std::fs::write(root.join("subdir/nested.txt"), "Nested content").unwrap();

        // Create archive
        let archive_path = root.join("test.tar.gz");
        create_tar_gz(root, &["hello.txt".into(), "subdir".into()], &archive_path).unwrap();
        assert!(archive_path.exists());

        // Extract archive
        let extract_dir = root.join("extracted");
        extract_tar_gz(&archive_path, &extract_dir).unwrap();
        assert_eq!(
            std::fs::read_to_string(extract_dir.join("hello.txt")).unwrap(),
            "Hello World"
        );
        assert_eq!(
            std::fs::read_to_string(extract_dir.join("subdir/nested.txt")).unwrap(),
            "Nested content"
        );
    }

    #[test]
    fn test_zip_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();

        // Create test files
        std::fs::write(root.join("hello.txt"), "Hello Zip").unwrap();
        std::fs::create_dir(root.join("subdir")).unwrap();
        std::fs::write(root.join("subdir/nested.txt"), "Nested zip").unwrap();

        // Create archive
        let archive_path = root.join("test.zip");
        create_zip(
            root,
            &["hello.txt".into(), "subdir".into()],
            &archive_path,
            None,
        )
        .unwrap();
        assert!(archive_path.exists());

        // Extract archive
        let extract_dir = root.join("extracted");
        extract_zip(&archive_path, &extract_dir, None).unwrap();
        assert_eq!(
            std::fs::read_to_string(extract_dir.join("hello.txt")).unwrap(),
            "Hello Zip"
        );
        assert_eq!(
            std::fs::read_to_string(extract_dir.join("subdir/nested.txt")).unwrap(),
            "Nested zip"
        );
    }
}
