//! Archive operations: compress and decompress files.
//!
//! Supports tar.gz, zip (with optional AES encryption), and listing archive contents.
//! For remote providers, files are streamed via read/write APIs.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use zesven::write::EntryMeta;
use zesven::{
    Archive as SevenZArchive, ArchivePath, ExtractOptions, Password, WriteOptions, Writer,
};

/// Supported archive formats.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ArchiveFormat {
    TarGz,
    Zip,
    #[serde(rename = "7z")]
    SevenZ,
    Rar,
}

impl ArchiveFormat {
    /// Detect format from file extension.
    pub fn from_path(path: &str) -> Option<Self> {
        let lower = path.to_lowercase();
        #[allow(clippy::case_sensitive_file_extension_comparisons)]
        if lower.ends_with(".tar.gz") || lower.ends_with(".tgz") {
            Some(Self::TarGz)
        } else if lower.ends_with(".zip") {
            Some(Self::Zip)
        } else if lower.ends_with(".7z") {
            Some(Self::SevenZ)
        } else if lower.ends_with(".rar") {
            Some(Self::Rar)
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
            Self::Rar => ".rar",
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
    password: Option<&str>,
) -> Result<ArchiveListResult, String> {
    let path_str = archive_path.to_string_lossy();

    if let Some(ArchiveFormat::TarGz) = ArchiveFormat::from_path(&path_str) {
        return list_tar_gz(archive_path);
    }
    if let Some(ArchiveFormat::Zip) = ArchiveFormat::from_path(&path_str) {
        return list_zip(archive_path);
    }
    if let Some(ArchiveFormat::SevenZ) = ArchiveFormat::from_path(&path_str) {
        return list_sevenz(archive_path, password);
    }
    if let Some(ArchiveFormat::Rar) = ArchiveFormat::from_path(&path_str) {
        return list_rar(archive_path, password);
    }

    // For unsupported formats, return error
    Err(format!("Unsupported archive format: {path_str}"))
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
            i64::try_from(t)
                .ok()
                .and_then(|secs| chrono::DateTime::from_timestamp(secs, 0))
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

fn list_sevenz(archive_path: &Path, password: Option<&str>) -> Result<ArchiveListResult, String> {
    let archive = if let Some(pwd) = password {
        SevenZArchive::open_path_with_password(archive_path, Password::new(pwd))
            .map_err(|e| format!("Failed to open 7z archive: {e}"))?
    } else {
        SevenZArchive::open_path(archive_path)
            .map_err(|e| format!("Failed to open 7z archive: {e}"))?
    };

    let mut entries = Vec::new();
    for entry in archive.entries() {
        if entry.is_anti {
            continue;
        }

        let modified = entry
            .modified()
            .map(|time| chrono::DateTime::<chrono::Utc>::from(time).to_rfc3339());

        entries.push(ArchiveEntry {
            path: entry.path.as_str().to_string(),
            size: entry.size,
            compressed_size: None,
            is_dir: entry.is_directory,
            modified,
            encrypted: Some(entry.is_encrypted),
        });
    }

    Ok(ArchiveListResult {
        entries,
        password_required: false,
        error: None,
    })
}

/// List RAR archive contents using the `unrar` CLI tool.
/// Falls back to `7z` if `unrar` is not installed.
/// Returns an error if neither tool is available.
fn list_rar(archive_path: &Path, _password: Option<&str>) -> Result<ArchiveListResult, String> {
    use std::process::Command;

    let path_str = archive_path.to_string_lossy();

    // Try `unrar lb` first (list bare - one file per line)
    let output = Command::new("unrar")
        .args(["lb", path_str.as_ref()])
        .output();

    if let Ok(out) = output {
        if out.status.success() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let entries = stdout
                .lines()
                .filter(|l| !l.is_empty())
                .map(|line| {
                    let is_dir = line.ends_with('/');
                    ArchiveEntry {
                        path: line.to_string(),
                        size: 0,
                        compressed_size: None,
                        is_dir,
                        modified: None,
                        encrypted: None,
                    }
                })
                .collect();
            return Ok(ArchiveListResult {
                entries,
                password_required: false,
                error: None,
            });
        }
        // unrar binary found but failed (e.g., bad password)
        let stderr = String::from_utf8_lossy(&out.stderr).to_lowercase();
        if stderr.contains("password") || stderr.contains("encrypted") {
            return Ok(ArchiveListResult {
                entries: Vec::new(),
                password_required: true,
                error: Some("Archive is password-protected".to_string()),
            });
        }
    }

    // Fallback: try `7z l` which also handles RAR (when 7-Zip is installed)
    let output7z = Command::new("7z")
        .args(["l", "-slt", path_str.as_ref()])
        .output();

    if let Ok(out) = output7z
        && out.status.success() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let entries = parse_sevenz_list_output(&stdout);
            return Ok(ArchiveListResult {
                entries,
                password_required: false,
                error: None,
            });
        }

    Err("RAR support requires `unrar` or `7z` (p7zip) to be installed on the system. Install with: brew install unrar  or  brew install p7zip".to_string())
}

/// Parse the output of `7z l -slt` into `ArchiveEntry` list.
fn parse_sevenz_list_output(output: &str) -> Vec<ArchiveEntry> {
    let mut entries = Vec::new();
    let mut current: std::collections::HashMap<&str, &str> = std::collections::HashMap::new();

    for line in output.lines() {
        if line.starts_with("----------") {
            // Block separator — flush current entry
            if let Some(path) = current.get("Path")
                && !path.is_empty() {
                    let is_dir = current.get("Attributes").is_some_and(|a| a.starts_with('D'));
                    let size = current.get("Size").and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
                    let compressed_size = current.get("Packed Size").and_then(|s| s.parse::<u64>().ok());
                    let modified = current.get("Modified").map(std::string::ToString::to_string);
                    entries.push(ArchiveEntry {
                        path: path.to_string(),
                        size,
                        compressed_size,
                        is_dir,
                        modified,
                        encrypted: None,
                    });
                }
            current.clear();
        } else if let Some((key, value)) = line.split_once(" = ") {
            current.insert(key.trim(), value.trim());
        }
    }

    entries
}

/// Decode a zip entry's raw name bytes.
/// Tries UTF-8 first; if that fails or produces mojibake, falls back to GB18030.
fn decode_zip_name(raw: &[u8]) -> String {
    // 1. Try UTF-8
    if let Ok(s) = std::str::from_utf8(raw) {
        // Check if the UTF-8 result looks like mojibake:
        // GBK-encoded Chinese bytes decoded as CP437 produce sequences of
        // accented Latin chars (é, ç, ü, etc.) without any CJK characters.
        // If the string contains CJK chars, it's genuine UTF-8.
        let has_cjk = s.chars().any(|c| {
            matches!(c as u32, 0x4e00..=0x9fff | 0x3400..=0x4dbf | 0xf900..=0xfaff)
        });
        if has_cjk || s.is_ascii() {
            return s.to_string();
        }
        // Looks like possible mojibake — try GB18030 below
    }

    // 2. Try GB18030 (superset of GBK)
    let (decoded, _encoding, _had_errors) = encoding_rs::GB18030.decode(raw);
    decoded.into_owned()
}

fn list_zip(archive_path: &Path) -> Result<ArchiveListResult, String> {
    let file = std::fs::File::open(archive_path).map_err(|e| format!("Failed to open: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip: {e}"))?;

    let mut entries = Vec::new();
    for i in 0..archive.len() {
        let entry = archive
            .by_index(i)
            .map_err(|e| format!("Entry error: {e}"))?;
        // Use name_raw() to get original bytes, then decode with GB18030 fallback
        let path = decode_zip_name(entry.name_raw());
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

/// Read a single file entry from a zip archive.
/// Uses name_raw() + encoding detection to match GBK-encoded filenames.
pub fn read_zip_entry(archive_path: &Path, entry_name: &str) -> Result<Vec<u8>, String> {
    let file = std::fs::File::open(archive_path).map_err(|e| format!("Failed to open: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip: {e}"))?;

    // Find the index by matching decoded names
    let mut target_index: Option<usize> = None;
    for i in 0..archive.len() {
        let entry = archive
            .by_index(i)
            .map_err(|e| format!("Entry error: {e}"))?;
        if decode_zip_name(entry.name_raw()) == entry_name {
            target_index = Some(i);
            break;
        }
    }

    let idx = target_index.ok_or_else(|| format!("Entry not found: {entry_name}"))?;
    let mut entry = archive
        .by_index(idx)
        .map_err(|e| format!("Entry error: {e}"))?;
    let mut buf = Vec::new();
    entry
        .read_to_end(&mut buf)
        .map_err(|e| format!("Read error: {e}"))?;
    Ok(buf)
}

/// Read a single file entry from a tar.gz archive.
pub fn read_tar_gz_entry(archive_path: &Path, entry_name: &str) -> Result<Vec<u8>, String> {
    let file = std::fs::File::open(archive_path).map_err(|e| format!("Failed to open: {e}"))?;
    let dec = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(dec);

    for entry in archive
        .entries()
        .map_err(|e| format!("Failed to read entries: {e}"))?
    {
        let mut entry = entry.map_err(|e| format!("Entry error: {e}"))?;
        let path = entry
            .path()
            .map_err(|e| format!("Path error: {e}"))?
            .to_string_lossy()
            .to_string();
        if path == entry_name || path == format!("{entry_name}/") {
            if entry.header().entry_type().is_dir() {
                return Ok(Vec::new());
            }
            let mut buf = Vec::new();
            entry
                .read_to_end(&mut buf)
                .map_err(|e| format!("Read error: {e}"))?;
            return Ok(buf);
        }
    }

    Err(format!("Entry not found: {entry_name}"))
}

/// Extract the last component of a relative path for use as archive entry name.
/// e.g. "a/b/c.txt" → "c.txt", "a/b/mydir" → "mydir"
fn entry_name(rel_path: &str) -> Result<&str, String> {
    let clean = rel_path.trim_start_matches('/');
    Path::new(clean)
        .file_name()
        .ok_or_else(|| format!("Invalid path (no file name): {rel_path}"))?
        .to_str()
        .ok_or_else(|| format!("Invalid path (non-UTF8): {rel_path}"))
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
        let name = entry_name(clean)?;
        if full.is_dir() {
            builder
                .append_dir_all(name, &full)
                .map_err(|e| format!("Failed to add directory: {e}"))?;
        } else {
            let mut f =
                std::fs::File::open(&full).map_err(|e| format!("Failed to open file: {e}"))?;
            builder
                .append_file(name, &mut f)
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
        let name = entry_name(clean)?;
        if full.is_dir() {
            add_dir_to_zip(&mut zip, name, &full, password)?;
        } else {
            let options = make_zip_options(password);
            zip.start_file(name, options)
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

/// Create a 7z archive from local files, optionally with password encryption.
pub fn create_sevenz(
    root: &Path,
    paths: &[String],
    dest: &Path,
    password: Option<&str>,
) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create archive directory: {e}"))?;
    }

    let writer = Writer::create_path(dest).map_err(|e| format!("Failed to create archive: {e}"))?;
    let options = if let Some(pwd) = password {
        WriteOptions::new()
            .password(Password::new(pwd))
            .encrypt_header(true)
            .encrypt_data(true)
    } else {
        WriteOptions::new()
    };
    let mut writer = writer.options(options);

    for rel_path in paths {
        let clean = rel_path.trim_start_matches('/');
        let full = root.join(clean);
        if !full.exists() {
            return Err(format!("Path not found: {rel_path}"));
        }
        let name = entry_name(clean)?;
        add_sevenz_path(&mut writer, &full, name)?;
    }

    let _ = writer
        .finish()
        .map_err(|e| format!("7z finalize error: {e}"))?;
    Ok(())
}

fn add_sevenz_path<W>(writer: &mut Writer<W>, full: &Path, archive_rel: &str) -> Result<(), String>
where
    W: std::io::Write + std::io::Seek,
{
    let normalized = archive_rel.replace('\\', "/");
    let archive_path =
        ArchivePath::new(&normalized).map_err(|e| format!("Invalid 7z path: {e}"))?;

    if full.is_dir() {
        let meta = EntryMeta::from_path(full).map_err(|e| format!("7z dir meta error: {e}"))?;
        writer
            .add_directory(archive_path, meta)
            .map_err(|e| format!("7z dir error: {e}"))?;

        for entry in std::fs::read_dir(full).map_err(|e| format!("Read dir error: {e}"))? {
            let entry = entry.map_err(|e| format!("Dir entry error: {e}"))?;
            let child_name = entry.file_name().to_string_lossy().to_string();
            let child_path = entry.path();
            let child_rel = format!("{}/{}", archive_rel.trim_end_matches('/'), child_name);
            add_sevenz_path(writer, &child_path, &child_rel)?;
        }
    } else {
        writer
            .add_path(full, archive_path)
            .map_err(|e| format!("7z file error: {e}"))?;
    }

    Ok(())
}

/// Extract a 7z archive to a local directory, with optional password.
pub fn extract_sevenz(
    archive_path: &Path,
    dest_dir: &Path,
    password: Option<&str>,
) -> Result<(), String> {
    let mut archive = if let Some(pwd) = password {
        SevenZArchive::open_path_with_password(archive_path, Password::new(pwd))
            .map_err(|e| format!("Failed to open 7z archive: {e}"))?
    } else {
        SevenZArchive::open_path(archive_path)
            .map_err(|e| format!("Failed to open 7z archive: {e}"))?
    };

    std::fs::create_dir_all(dest_dir).map_err(|e| format!("Destination error: {e}"))?;
    let _ = archive
        .extract(dest_dir, (), &ExtractOptions::default())
        .map_err(|e| format!("7z extract error: {e}"))?;
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
    archive_prefix: &str,
    dir: &Path,
    password: Option<&str>,
) -> Result<(), String> {
    // Add directory entry
    let options = make_zip_options(password);
    zip.add_directory(format!("{archive_prefix}/"), options)
        .map_err(|e| format!("Zip dir error: {e}"))?;

    for entry in std::fs::read_dir(dir).map_err(|e| format!("Read dir error: {e}"))? {
        let entry = entry.map_err(|e| format!("Dir entry error: {e}"))?;
        let child_name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        let child_archive = format!("{archive_prefix}/{child_name}");
        if path.is_dir() {
            add_dir_to_zip(zip, &child_archive, &path, password)?;
        } else {
            let opts = make_zip_options(password);
            zip.start_file(&child_archive, opts)
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

        // Decode filename with GB18030 fallback (same as list_zip / read_zip_entry)
        let decoded = decode_zip_name(entry.name_raw());
        // Skip entries with unsafe paths
        if decoded.contains("..") || decoded.starts_with('/') {
            continue;
        }
        let name = PathBuf::from(&decoded);
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

/// Extract a RAR archive to a local directory using the system `unrar` or `7z` tool.
pub fn extract_rar(
    archive_path: &Path,
    dest_dir: &Path,
    password: Option<&str>,
) -> Result<(), String> {
    use std::process::Command;

    std::fs::create_dir_all(dest_dir).map_err(|e| format!("Create dest dir failed: {e}"))?;
    let path_str = archive_path.to_string_lossy();
    let dest_str = dest_dir.to_string_lossy();

    // Try `unrar x` first
    let mut args = vec!["x".to_string(), "-o+".to_string()];
    if let Some(pwd) = password {
        args.push(format!("-p{pwd}"));
    }
    args.push(path_str.to_string());
    args.push(dest_str.to_string());

    let out = Command::new("unrar").args(&args).output();

    if let Ok(o) = out {
        if o.status.success() {
            return Ok(());
        }
        let stderr = String::from_utf8_lossy(&o.stderr);
        if !stderr.is_empty() {
            return Err(format!("unrar extract error: {stderr}"));
        }
    }

    // Fallback: try `7z x`
    let mut args7z = vec!["x".to_string(), path_str.to_string(), format!("-o{}", dest_str), "-y".to_string()];
    if let Some(pwd) = password {
        args7z.push(format!("-p{pwd}"));
    }
    let out7z = Command::new("7z").args(&args7z).output();

    if let Ok(o) = out7z {
        if o.status.success() {
            return Ok(());
        }
        let stderr = String::from_utf8_lossy(&o.stderr);
        return Err(format!("7z extract error: {stderr}"));
    }

    Err("RAR extraction requires `unrar` or `7z` (p7zip) installed on the system. Install with: brew install unrar  or  brew install p7zip".to_string())
}

/// Create a RAR archive using the system `rar` tool.
pub fn create_rar(
    root: &Path,
    paths: &[String],
    dest: &Path,
    password: Option<&str>,
) -> Result<(), String> {
    use std::process::Command;

    let dest_str = dest.to_string_lossy();
    let mut args = vec!["a".to_string(), dest_str.to_string()];
    if let Some(pwd) = password {
        args.push(format!("-hp{pwd}"));
    }
    for path in paths {
        let abs = root.join(path);
        args.push(abs.to_string_lossy().to_string());
    }

    let out = Command::new("rar").args(&args).output();
    match out {
        Ok(o) if o.status.success() => Ok(()),
        Ok(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            let stdout = String::from_utf8_lossy(&o.stdout);
            let msg = if stderr.is_empty() { stdout.to_string() } else { stderr.to_string() };
            Err(format!("rar compression error: {msg}"))
        }
        Err(e) => Err(format!(
            "Failed to run `rar`: {e}. Install with: brew install rar  or  apt install rar"
        )),
    }
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
        assert_eq!(
            ArchiveFormat::from_path("test.rar"),
            Some(ArchiveFormat::Rar)
        );
        assert_eq!(
            ArchiveFormat::from_path("test.RAR"),
            Some(ArchiveFormat::Rar)
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

    #[test]
    fn test_sevenz_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();

        std::fs::write(root.join("hello.txt"), "Hello 7z").unwrap();
        std::fs::create_dir_all(root.join("subdir/deeper")).unwrap();
        std::fs::write(root.join("subdir/nested.txt"), "Nested 7z").unwrap();
        std::fs::write(root.join("subdir/deeper/final.txt"), "Final 7z").unwrap();

        let archive_path = root.join("test.7z");
        create_sevenz(
            root,
            &["hello.txt".into(), "subdir".into()],
            &archive_path,
            None,
        )
        .unwrap();
        assert!(archive_path.exists());

        let listed = list_archive(&archive_path, None).unwrap();
        assert!(listed.entries.iter().any(|entry| entry.path == "hello.txt"));
        assert!(
            listed
                .entries
                .iter()
                .any(|entry| entry.path == "subdir/nested.txt")
        );

        let extract_dir = root.join("extracted");
        extract_sevenz(&archive_path, &extract_dir, None).unwrap();
        assert_eq!(
            std::fs::read_to_string(extract_dir.join("hello.txt")).unwrap(),
            "Hello 7z"
        );
        assert_eq!(
            std::fs::read_to_string(extract_dir.join("subdir/nested.txt")).unwrap(),
            "Nested 7z"
        );
        assert_eq!(
            std::fs::read_to_string(extract_dir.join("subdir/deeper/final.txt")).unwrap(),
            "Final 7z"
        );
    }

    /// Test that deep paths are stored using only the last component name,
    /// not the full relative path. This prevents the "double path" bug
    /// where /a/b/c.txt gets extracted as /a/b/a/b/c.txt.
    #[test]
    fn test_deep_path_uses_filename_only() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();

        // Create nested structure: a/b/deep.txt and a/b/mydir/inner.txt
        std::fs::create_dir_all(root.join("a/b/mydir")).unwrap();
        std::fs::write(root.join("a/b/deep.txt"), "Deep content").unwrap();
        std::fs::write(root.join("a/b/mydir/inner.txt"), "Inner content").unwrap();

        // Compress using the deep path as input
        let archive_path = root.join("test.zip");
        create_zip(
            root,
            &["a/b/deep.txt".into(), "a/b/mydir".into()],
            &archive_path,
            None,
        )
        .unwrap();

        // List entries and verify paths
        let listed = list_archive(&archive_path, None).unwrap();
        let paths: Vec<&str> = listed.entries.iter().map(|e| e.path.as_str()).collect();
        // File should be stored as "deep.txt", NOT "a/b/deep.txt"
        assert!(paths.contains(&"deep.txt"), "Expected 'deep.txt' in archive, got: {paths:?}");
        assert!(
            !paths.iter().any(|p| p.contains("a/b/deep.txt")),
            "Should NOT contain full path 'a/b/deep.txt', got: {paths:?}"
        );
        // Directory entries should start with "mydir/", NOT "a/b/mydir/"
        assert!(paths.contains(&"mydir/"), "Expected 'mydir/' in archive, got: {paths:?}");
        assert!(
            paths.contains(&"mydir/inner.txt"),
            "Expected 'mydir/inner.txt' in archive, got: {paths:?}"
        );

        // Extract to a new dir and verify no path duplication
        let extract_dir = root.join("extracted");
        extract_zip(&archive_path, &extract_dir, None).unwrap();
        assert_eq!(
            std::fs::read_to_string(extract_dir.join("deep.txt")).unwrap(),
            "Deep content"
        );
        assert_eq!(
            std::fs::read_to_string(extract_dir.join("mydir/inner.txt")).unwrap(),
            "Inner content"
        );
    }

    /// Test that decode_zip_name correctly handles GBK-encoded bytes.
    #[test]
    fn test_decode_zip_name_gbk() {
        // "测试文件.txt" in GBK bytes
        let gbk_bytes: &[u8] = &[
            0xB2, 0xE2, 0xCA, 0xD4, 0xCE, 0xC4, 0xBC, 0xFE, 0x2E, 0x74, 0x78, 0x74,
        ];
        let decoded = decode_zip_name(gbk_bytes);
        assert_eq!(decoded, "测试文件.txt", "GBK bytes should decode to Chinese");
    }

    /// Test that decode_zip_name handles UTF-8 correctly.
    #[test]
    fn test_decode_zip_name_utf8() {
        let utf8_bytes = "hello世界.txt".as_bytes();
        let decoded = decode_zip_name(utf8_bytes);
        assert_eq!(decoded, "hello世界.txt");
    }

    /// Test that decode_zip_name handles ASCII correctly.
    #[test]
    fn test_decode_zip_name_ascii() {
        let ascii_bytes = b"readme.txt";
        let decoded = decode_zip_name(ascii_bytes);
        assert_eq!(decoded, "readme.txt");
    }

    /// Test that extract_zip correctly decodes GBK-encoded filenames.
    /// Creates a zip using the zip crate, then patches the UTF-8 flag
    /// to simulate a Chinese Windows-created archive.
    #[test]
    fn test_extract_zip_gbk_filename() {
        use std::io::Write;

        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();

        // "测试文件.txt" in GBK bytes
        let gbk_name: &[u8] = &[
            0xB2, 0xE2, 0xCA, 0xD4, 0xCE, 0xC4, 0xBC, 0xFE, 0x2E, 0x74, 0x78, 0x74,
        ];
        let content = b"Hello GBK world";

        // Step 1: Create a zip with a 12-char placeholder matching GBK name length
        let zip_path = root.join("gbk_test.zip");
        {
            let file = std::fs::File::create(&zip_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Stored);
            zip.start_file("abcdefghijkl", options).unwrap();
            zip.write_all(content).unwrap();
            zip.finish().unwrap();
        }

        // Step 2: Patch the zip — replace filename with GBK bytes and clear UTF-8 flag
        let mut data = std::fs::read(&zip_path).unwrap();

        // Local file header: flags at offset 6, name at offset 30
        let flags_local = u16::from_le_bytes([data[6], data[7]]);
        data[6..8].copy_from_slice(&(flags_local & !(1 << 11)).to_le_bytes());
        data[30..42].copy_from_slice(gbk_name);

        // Find central directory entry
        // EOCD starts with PK\x05\x06
        let eocd_pos = data
            .windows(4)
            .rposition(|w| w == b"PK\x05\x06")
            .expect("EOCD not found");
        let cd_offset = u32::from_le_bytes([
            data[eocd_pos + 16],
            data[eocd_pos + 17],
            data[eocd_pos + 18],
            data[eocd_pos + 19],
        ]) as usize;

        // Central directory entry: flags at cd_offset+8, name at cd_offset+46
        let flags_cd = u16::from_le_bytes([data[cd_offset + 8], data[cd_offset + 9]]);
        let patched_flags_cd = flags_cd & !(1 << 11);
        data[cd_offset + 8..cd_offset + 10].copy_from_slice(&patched_flags_cd.to_le_bytes());
        data[cd_offset + 46..cd_offset + 58].copy_from_slice(gbk_name);

        std::fs::write(&zip_path, &data).unwrap();

        // Step 3: Extract and verify
        let extract_dir = root.join("extracted");
        extract_zip(&zip_path, &extract_dir, None).unwrap();

        let expected = extract_dir.join("测试文件.txt");
        assert!(
            expected.exists(),
            "Expected '测试文件.txt' to exist after extraction"
        );
        assert_eq!(
            std::fs::read_to_string(&expected).unwrap(),
            "Hello GBK world"
        );
    }

    /// Same deep-path test for tar.gz format.
    #[test]
    fn test_deep_path_tar_gz_filename_only() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();

        std::fs::create_dir_all(root.join("x/y/z")).unwrap();
        std::fs::write(root.join("x/y/z/data.bin"), "Binary data").unwrap();

        let archive_path = root.join("out.tar.gz");
        create_tar_gz(
            root,
            &["x/y/z/data.bin".into()],
            &archive_path,
        )
        .unwrap();

        // Verify archive entry is "data.bin", not "x/y/z/data.bin"
        let file = std::fs::File::open(&archive_path).unwrap();
        let dec = flate2::read::GzDecoder::new(file);
        let mut archive = tar::Archive::new(dec);
        let entries: Vec<String> = archive
            .entries()
            .unwrap()
            .map(|e| e.unwrap().path().unwrap().to_string_lossy().to_string())
            .collect();
        assert!(
            entries.iter().any(|p| p == "data.bin"),
            "Expected 'data.bin' in tar.gz, got: {entries:?}"
        );
        assert!(
            !entries.iter().any(|p| p.contains("x/y/z")),
            "Should NOT contain full path, got: {entries:?}"
        );
    }
}
