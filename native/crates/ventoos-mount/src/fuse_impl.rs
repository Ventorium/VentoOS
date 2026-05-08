//! FUSE filesystem implementation for Linux and macOS.
//!
//! Bridges the async VfsManager to the synchronous fuser Filesystem trait
//! using tokio::runtime::Handle::block_on.

use std::collections::HashMap;
use std::ffi::OsStr;
use std::sync::{Arc, Mutex, RwLock as StdRwLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use fuser::{
    Errno, FileAttr, FileType, Filesystem, FopenFlags, Generation, INodeNo, KernelConfig,
    MountOption, ReplyAttr, ReplyCreate, ReplyData, ReplyDirectory, ReplyEmpty, ReplyEntry,
    ReplyOpen, ReplyWrite, RenameFlags, Request,
};

use ventoos_vfs::types::{VfsDeleteReq, VfsListReq, VfsMkdirReq, VfsMoveReq, VfsWriteReq};
use ventoos_vfs::VfsManager;

const TTL: Duration = Duration::from_secs(1);
/// Cache TTL for node metadata — avoids redundant remote stat calls after readdir.
const CACHE_TTL: Duration = Duration::from_secs(5);
const ROOT_INO: u64 = 1;

// ── Inode table ──────────────────────────────────────────────────────────────

struct InodeTable {
    next: u64,
    ino_to_path: HashMap<u64, String>,
    path_to_ino: HashMap<String, u64>,
}

impl InodeTable {
    fn new() -> Self {
        let mut t = Self {
            next: 2,
            ino_to_path: HashMap::new(),
            path_to_ino: HashMap::new(),
        };
        t.ino_to_path.insert(ROOT_INO, "/".to_string());
        t.path_to_ino.insert("/".to_string(), ROOT_INO);
        t
    }
    fn get_path(&self, ino: u64) -> Option<&str> {
        self.ino_to_path.get(&ino).map(|s| s.as_str())
    }
    fn intern(&mut self, path: String) -> u64 {
        if let Some(&ino) = self.path_to_ino.get(&path) {
            return ino;
        }
        let ino = self.next;
        self.next += 1;
        self.ino_to_path.insert(ino, path.clone());
        self.path_to_ino.insert(path, ino);
        ino
    }
    fn remove(&mut self, path: &str) {
        if let Some(ino) = self.path_to_ino.remove(path) {
            self.ino_to_path.remove(&ino);
        }
    }
}

// ── Node metadata cache ───────────────────────────────────────────────────────

/// Short-lived cache for node metadata, keyed by VFS path.
/// Populated during `readdir` so that subsequent `lookup`/`getattr` calls
/// for entries returned in the same listing can skip a remote round trip.
struct NodeCache {
    entries: HashMap<String, (ventoos_vfs::types::VfsNode, Instant)>,
}

impl NodeCache {
    fn new() -> Self {
        Self { entries: HashMap::new() }
    }

    fn get(&self, path: &str) -> Option<&ventoos_vfs::types::VfsNode> {
        self.entries.get(path).and_then(|(node, cached_at)| {
            if cached_at.elapsed() < CACHE_TTL { Some(node) } else { None }
        })
    }

    fn insert(&mut self, node: ventoos_vfs::types::VfsNode) {
        let path = node.path.clone();
        self.entries.insert(path, (node, Instant::now()));
    }

    fn invalidate(&mut self, path: &str) {
        self.entries.remove(path);
    }
}

// ── Open file handle ─────────────────────────────────────────────────────────

struct OpenFile {
    path: String,
    data: Vec<u8>,
    dirty: bool,
}

// ── FUSE filesystem ───────────────────────────────────────────────────────────

pub(crate) struct VfsFuse {
    mount_id: String,
    vfs: Arc<VfsManager>,
    rt: tokio::runtime::Handle,
    inodes: StdRwLock<InodeTable>,
    open_files: Mutex<HashMap<u64, OpenFile>>,
    next_fh: Mutex<u64>,
    node_cache: Mutex<NodeCache>,
    /// One-shot channel to notify mount result (success or failure).
    /// Sent in `init()` on success, consumed by caller on failure.
    notify: Mutex<Option<tokio::sync::oneshot::Sender<Result<(), String>>>>,
}

impl VfsFuse {
    fn new(
        mount_id: String,
        vfs: Arc<VfsManager>,
        rt: tokio::runtime::Handle,
        notify: tokio::sync::oneshot::Sender<Result<(), String>>,
    ) -> Self {
        Self {
            mount_id,
            vfs,
            rt,
            inodes: StdRwLock::new(InodeTable::new()),
            open_files: Mutex::new(HashMap::new()),
            next_fh: Mutex::new(1),
            node_cache: Mutex::new(NodeCache::new()),
            notify: Mutex::new(Some(notify)),
        }
    }
    fn alloc_fh(&self) -> u64 {
        let mut n = self.next_fh.lock().unwrap();
        let fh = *n;
        *n += 1;
        fh
    }
    fn path_for(&self, ino: u64) -> Option<String> {
        self.inodes.read().unwrap().get_path(ino).map(|s| s.to_string())
    }
    fn intern_path(&self, path: String) -> u64 {
        self.inodes.write().unwrap().intern(path)
    }
    fn child_path(parent_path: &str, name: &OsStr) -> String {
        let name = name.to_string_lossy();
        if parent_path == "/" {
            format!("/{name}")
        } else {
            format!("{parent_path}/{name}")
        }
    }
    fn make_attr(&self, ino: u64, is_dir: bool, size: u64, mtime: SystemTime) -> FileAttr {
        let uid = unsafe { libc::getuid() };
        let gid = unsafe { libc::getgid() };
        let kind = if is_dir { FileType::Directory } else { FileType::RegularFile };
        let perm: u16 = if is_dir { 0o755 } else { 0o644 };
        let nlink: u32 = if is_dir { 2 } else { 1 };
        FileAttr {
            ino: INodeNo(ino),
            size,
            blocks: size.div_ceil(512),
            atime: mtime,
            mtime,
            ctime: mtime,
            crtime: UNIX_EPOCH,
            kind,
            perm,
            nlink,
            uid,
            gid,
            rdev: 0,
            blksize: 4096,
            flags: 0,
        }
    }
    fn parse_mtime(modified: Option<&str>) -> SystemTime {
        modified
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok()
                .map(|dt| UNIX_EPOCH + Duration::from_secs(dt.timestamp().max(0) as u64)))
            .unwrap_or(UNIX_EPOCH)
    }
    fn remove_entry(&self, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        let Some(pp) = self.path_for(parent.0) else { reply.error(Errno::ENOENT); return; };
        let path = Self::child_path(&pp, name);
        let req = VfsDeleteReq { mount_id: self.mount_id.clone(), path: path.clone() };
        let vfs = Arc::clone(&self.vfs);
        match self.rt.block_on(vfs.delete(&req)) {
            Ok(()) => { self.inodes.write().unwrap().remove(&path); reply.ok(); }
            Err(e) => { tracing::warn!("FUSE delete failed: {e}"); reply.error(Errno::EIO); }
        }
    }
}

impl Filesystem for VfsFuse {
    fn init(&mut self, _req: &Request, _config: &mut KernelConfig) -> std::io::Result<()> {
        tracing::info!("FUSE init: mount_id={}", self.mount_id);
        // Signal mount success to the caller.
        if let Some(tx) = self.notify.lock().unwrap().take() {
            let _ = tx.send(Ok(()));
        }
        Ok(())
    }
    fn destroy(&mut self) {
        tracing::info!("FUSE destroy: mount_id={}", self.mount_id);
    }

    fn lookup(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEntry) {
        let Some(pp) = self.path_for(parent.0) else { reply.error(Errno::ENOENT); return; };
        let path = Self::child_path(&pp, name);

        // Check cache first to avoid a remote round trip
        if let Some(node) = self.node_cache.lock().unwrap().get(&path) {
            let ino = self.intern_path(path);
            let mtime = Self::parse_mtime(node.modified.as_deref());
            let attr = self.make_attr(ino, node.is_dir, node.size.unwrap_or(0), mtime);
            reply.entry(&TTL, &attr, Generation(0));
            return;
        }

        let vfs = Arc::clone(&self.vfs);
        let mid = self.mount_id.clone();
        match self.rt.block_on(vfs.stat(&mid, &path)) {
            Ok(node) => {
                let ino = self.intern_path(path.clone());
                let mtime = Self::parse_mtime(node.modified.as_deref());
                let attr = self.make_attr(ino, node.is_dir, node.size.unwrap_or(0), mtime);
                self.node_cache.lock().unwrap().insert(node);
                reply.entry(&TTL, &attr, Generation(0));
            }
            Err(_) => reply.error(Errno::ENOENT),
        }
    }

    fn getattr(&self, _req: &Request, ino: INodeNo, _fh: Option<fuser::FileHandle>, reply: ReplyAttr) {
        let Some(path) = self.path_for(ino.0) else { reply.error(Errno::ENOENT); return; };

        // Check cache first
        if let Some(node) = self.node_cache.lock().unwrap().get(&path) {
            let mtime = Self::parse_mtime(node.modified.as_deref());
            let attr = self.make_attr(ino.0, node.is_dir, node.size.unwrap_or(0), mtime);
            reply.attr(&TTL, &attr);
            return;
        }

        let vfs = Arc::clone(&self.vfs);
        let mid = self.mount_id.clone();
        match self.rt.block_on(vfs.stat(&mid, &path)) {
            Ok(node) => {
                let mtime = Self::parse_mtime(node.modified.as_deref());
                let attr = self.make_attr(ino.0, node.is_dir, node.size.unwrap_or(0), mtime);
                self.node_cache.lock().unwrap().insert(node);
                reply.attr(&TTL, &attr);
            }
            Err(_) => reply.error(Errno::ENOENT),
        }
    }

    fn readdir(&self, _req: &Request, ino: INodeNo, _fh: fuser::FileHandle, offset: u64, mut reply: ReplyDirectory) {
        let Some(path) = self.path_for(ino.0) else { reply.error(Errno::ENOENT); return; };
        let vfs = Arc::clone(&self.vfs);
        let mid = self.mount_id.clone();
        let req = VfsListReq { mount_id: mid, path: path.clone(), show_hidden: true };
        match self.rt.block_on(vfs.list_dir(&req)) {
            Ok(nodes) => {
                let dot_ino = ino.0;
                let par_str = { let p = path.trim_end_matches('/'); let par = p.rfind('/').map(|i| &p[..i]).unwrap_or("/"); if par.is_empty() { "/".to_string() } else { par.to_string() } };
                let par_ino = self.intern_path(par_str);
                let mut all: Vec<(u64, bool, String)> = vec![
                    (dot_ino, true, ".".to_string()),
                    (par_ino, true, "..".to_string()),
                ];
                // Cache each returned node so lookup/getattr don't need remote calls
                let mut cache = self.node_cache.lock().unwrap();
                for node in &nodes {
                    let child_ino = self.intern_path(node.path.clone());
                    all.push((child_ino, node.is_dir, node.name.clone()));
                    cache.insert(node.clone());
                }
                drop(cache);
                for (i, (child_ino, is_dir, name)) in all.iter().enumerate().skip(offset as usize) {
                    let kind = if *is_dir { FileType::Directory } else { FileType::RegularFile };
                    if reply.add(INodeNo(*child_ino), (i + 1) as u64, kind, name.as_str()) { break; }
                }
                reply.ok();
            }
            Err(e) => { tracing::warn!("readdir error: {e}"); reply.error(Errno::EIO); }
        }
    }

    fn open(&self, _req: &Request, ino: INodeNo, _flags: fuser::OpenFlags, reply: ReplyOpen) {
        let Some(path) = self.path_for(ino.0) else { reply.error(Errno::ENOENT); return; };
        let vfs = Arc::clone(&self.vfs);
        let mid = self.mount_id.clone();
        match self.rt.block_on(vfs.read_file_raw(&mid, &path)) {
            Ok(data) => {
                let fh = self.alloc_fh();
                self.open_files.lock().unwrap().insert(fh, OpenFile { path, data, dirty: false });
                reply.opened(fuser::FileHandle(fh), FopenFlags::empty());
            }
            Err(_) => reply.error(Errno::EIO),
        }
    }

    fn read(&self, _req: &Request, _ino: INodeNo, fh: fuser::FileHandle, offset: u64, size: u32, _flags: fuser::OpenFlags, _lock_owner: Option<fuser::LockOwner>, reply: ReplyData) {
        let files = self.open_files.lock().unwrap();
        let Some(file) = files.get(&fh.0) else { reply.error(Errno::EBADF); return; };
        let start = offset as usize;
        if start >= file.data.len() { reply.data(&[]); return; }
        let end = (start + size as usize).min(file.data.len());
        reply.data(&file.data[start..end]);
    }

    fn write(&self, _req: &Request, _ino: INodeNo, fh: fuser::FileHandle, offset: u64, data: &[u8], _write_flags: fuser::WriteFlags, _flags: fuser::OpenFlags, _lock_owner: Option<fuser::LockOwner>, reply: ReplyWrite) {
        let mut files = self.open_files.lock().unwrap();
        let Some(file) = files.get_mut(&fh.0) else { reply.error(Errno::EBADF); return; };
        let start = offset as usize;
        let end = start + data.len();
        if end > file.data.len() { file.data.resize(end, 0); }
        file.data[start..end].copy_from_slice(data);
        file.dirty = true;
        reply.written(data.len() as u32);
    }

    fn release(&self, _req: &Request, _ino: INodeNo, fh: fuser::FileHandle, _flags: fuser::OpenFlags, _lock_owner: Option<fuser::LockOwner>, _flush: bool, reply: ReplyEmpty) {
        let file = self.open_files.lock().unwrap().remove(&fh.0);
        if let Some(file) = file
            && file.dirty {
                let content = String::from_utf8_lossy(&file.data).to_string();
                // Invalidate cache for the written file
                self.node_cache.lock().unwrap().invalidate(&file.path);
                let req = VfsWriteReq { mount_id: self.mount_id.clone(), path: file.path, content };
                let vfs = Arc::clone(&self.vfs);
                if let Err(e) = self.rt.block_on(vfs.write_file(&req)) {
                    tracing::warn!("FUSE release write-back failed: {e}");
                }
            }
        reply.ok();
    }

    fn create(&self, _req: &Request, parent: INodeNo, name: &OsStr, _mode: u32, _umask: u32, _flags: i32, reply: ReplyCreate) {
        let Some(pp) = self.path_for(parent.0) else { reply.error(Errno::ENOENT); return; };
        let path = Self::child_path(&pp, name);
        let req = VfsWriteReq { mount_id: self.mount_id.clone(), path: path.clone(), content: String::new() };
        let vfs = Arc::clone(&self.vfs);
        if let Err(e) = self.rt.block_on(vfs.write_file(&req)) {
            tracing::warn!("FUSE create failed: {e}");
            reply.error(Errno::EIO);
            return;
        }
        // Invalidate parent directory cache
        self.node_cache.lock().unwrap().invalidate(&pp);
        let ino = self.intern_path(path.clone());
        let fh = self.alloc_fh();
        self.open_files.lock().unwrap().insert(fh, OpenFile { path, data: vec![], dirty: false });
        let attr = self.make_attr(ino, false, 0, SystemTime::now());
        reply.created(&TTL, &attr, Generation(0), fuser::FileHandle(fh), FopenFlags::empty());
    }

    fn mkdir(&self, _req: &Request, parent: INodeNo, name: &OsStr, _mode: u32, _umask: u32, reply: ReplyEntry) {
        let Some(pp) = self.path_for(parent.0) else { reply.error(Errno::ENOENT); return; };
        let path = Self::child_path(&pp, name);
        let req = VfsMkdirReq { mount_id: self.mount_id.clone(), path: path.clone() };
        let vfs = Arc::clone(&self.vfs);
        if let Err(e) = self.rt.block_on(vfs.mkdir(&req)) {
            tracing::warn!("FUSE mkdir failed: {e}"); reply.error(Errno::EIO); return;
        }
        self.node_cache.lock().unwrap().invalidate(&pp);
        let ino = self.intern_path(path);
        let attr = self.make_attr(ino, true, 0, SystemTime::now());
        reply.entry(&TTL, &attr, Generation(0));
    }

    fn unlink(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        let pp = self.path_for(parent.0);
        let path = pp.as_deref().map(|p| Self::child_path(p, name));
        if let Some(ref p) = path { self.node_cache.lock().unwrap().invalidate(p); }
        self.remove_entry(parent, name, reply);
    }
    fn rmdir(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        let pp = self.path_for(parent.0);
        let path = pp.as_deref().map(|p| Self::child_path(p, name));
        if let Some(ref p) = path { self.node_cache.lock().unwrap().invalidate(p); }
        self.remove_entry(parent, name, reply);
    }

    fn rename(&self, _req: &Request, parent: INodeNo, name: &OsStr, newparent: INodeNo, newname: &OsStr, _flags: RenameFlags, reply: ReplyEmpty) {
        let (Some(sp), Some(dp)) = (self.path_for(parent.0), self.path_for(newparent.0)) else {
            reply.error(Errno::ENOENT); return;
        };
        let src = Self::child_path(&sp, name);
        let dst = Self::child_path(&dp, newname);
        let req = VfsMoveReq { mount_id: self.mount_id.clone(), src: src.clone(), dest: dst };
        let vfs = Arc::clone(&self.vfs);
        match self.rt.block_on(vfs.move_file(&req)) {
            Ok(()) => {
                let mut cache = self.node_cache.lock().unwrap();
                cache.invalidate(&src);
                drop(cache);
                self.inodes.write().unwrap().remove(&src);
                reply.ok();
            }
            Err(e) => { tracing::warn!("FUSE rename failed: {e}"); reply.error(Errno::EIO); }
        }
    }
}

// ── macOS version detection ──────────────────────────────────────────────────

/// Read the macOS product version string (e.g. "15.4.1").
#[cfg(target_os = "macos")]
fn read_macos_version() -> Option<String> {
    let output = std::process::Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .ok()?;
    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Returns `true` if the current macOS version supports FSKit (>= 15.4)
/// **and** the installed libfuse3 library supports the `backend=fskit` option.
#[cfg(target_os = "macos")]
pub(crate) fn is_fskit_available() -> bool {
    let version = match read_macos_version() {
        Some(v) => v,
        None => return false,
    };
    let mut parts = version.split('.');
    let major: u32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let minor: u32 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    if !(major > 15 || (major == 15 && minor >= 4)) {
        return false;
    }
    // The `backend=fskit` option is handled by libfuse3 (which the fuser crate links),
    // not by the mount_macfuse binary. Check libfuse3 for the "fskit" string.
    let libfuse3_path = "/usr/local/lib/libfuse3.dylib";
    if std::path::Path::new(libfuse3_path).exists()
        && let Ok(output) = std::process::Command::new("strings")
            .arg(libfuse3_path)
            .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.contains("fskit") && stdout.contains("backend") {
            return true;
        }
    }
    tracing::info!(
        "macOS supports FSKit but libfuse3 does not support backend=fskit — skipping FSKit"
    );
    false
}

// ── Mount entry point ─────────────────────────────────────────────────────────

pub(crate) async fn run_fuse_mount(
    mount_id: String,
    mount_name: String,
    mount_point: String,
    vfs: Arc<VfsManager>,
    state: Arc<tokio::sync::RwLock<std::collections::HashMap<String, crate::manager::MountState>>>,
    notify: tokio::sync::oneshot::Sender<Result<(), String>>,
) {
    let rt = tokio::runtime::Handle::current();
    let id_clone = mount_id.clone();
    let result = tokio::task::spawn_blocking(move || {
        let fs = VfsFuse::new(mount_id.clone(), vfs, rt, notify);
        let mut config = fuser::Config::default();

        let mut options = vec![
            MountOption::FSName(format!("ventoos-{mount_id}")),
            MountOption::DefaultPermissions,
            // Set volume name so Finder shows the source name instead of "macFUSE Volume 0"
            MountOption::CUSTOM(format!("volname={mount_name}")),
        ];

        // On macOS 15.4+ use FSKit backend instead of the kernel extension.
        // FSKit is Apple's modern user-space filesystem API.
        #[cfg(target_os = "macos")]
        if is_fskit_available() {
            options.push(MountOption::CUSTOM("backend=fskit".to_string()));
        }

        config.mount_options = options;
        fuser::mount2(fs, &mount_point, &config)
    })
    .await;
    if let Ok(Err(e)) = result {
        let mut lock = state.write().await;
        lock.insert(id_clone.clone(), crate::manager::MountState::Error(e.to_string()));
        tracing::error!("FUSE mount for {id_clone} failed: {e}");
    }
}

pub(crate) fn force_unmount(mount_point: &str) {
    #[cfg(target_os = "macos")]
    { let _ = std::process::Command::new("diskutil").args(["unmount", "force", mount_point]).status(); }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("fusermount").args(["-u", "-z", mount_point]).status()
            .or_else(|_| std::process::Command::new("umount").args(["-l", mount_point]).status());
    }
}
