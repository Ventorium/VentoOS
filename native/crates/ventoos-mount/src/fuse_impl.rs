//! FUSE filesystem implementation for Linux and macOS.
//!
//! Bridges the async VfsManager to the synchronous fuser Filesystem trait
//! using tokio::runtime::Handle::block_on.

use std::collections::HashMap;
use std::ffi::OsStr;
use std::sync::{Arc, Mutex, RwLock as StdRwLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use fuser::{
    Errno, FileAttr, FileType, Filesystem, FopenFlags, Generation, INodeNo, KernelConfig,
    MountOption, ReplyAttr, ReplyCreate, ReplyData, ReplyDirectory, ReplyEmpty, ReplyEntry,
    ReplyOpen, ReplyWrite, RenameFlags, Request,
};

use ventoos_vfs::types::{VfsDeleteReq, VfsListReq, VfsMkdirReq, VfsMoveReq, VfsWriteReq};
use ventoos_vfs::VfsManager;

const TTL: Duration = Duration::from_secs(1);
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
}

impl VfsFuse {
    fn new(mount_id: String, vfs: Arc<VfsManager>, rt: tokio::runtime::Handle) -> Self {
        Self {
            mount_id,
            vfs,
            rt,
            inodes: StdRwLock::new(InodeTable::new()),
            open_files: Mutex::new(HashMap::new()),
            next_fh: Mutex::new(1),
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
            blocks: (size + 511) / 512,
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
        Ok(())
    }
    fn destroy(&mut self) {
        tracing::info!("FUSE destroy: mount_id={}", self.mount_id);
    }

    fn lookup(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEntry) {
        let Some(pp) = self.path_for(parent.0) else { reply.error(Errno::ENOENT); return; };
        let path = Self::child_path(&pp, name);
        let vfs = Arc::clone(&self.vfs);
        let mid = self.mount_id.clone();
        match self.rt.block_on(vfs.stat(&mid, &path)) {
            Ok(node) => {
                let ino = self.intern_path(path);
                let mtime = Self::parse_mtime(node.modified.as_deref());
                let attr = self.make_attr(ino, node.is_dir, node.size.unwrap_or(0), mtime);
                reply.entry(&TTL, &attr, Generation(0));
            }
            Err(_) => reply.error(Errno::ENOENT),
        }
    }

    fn getattr(&self, _req: &Request, ino: INodeNo, _fh: Option<fuser::FileHandle>, reply: ReplyAttr) {
        let Some(path) = self.path_for(ino.0) else { reply.error(Errno::ENOENT); return; };
        let vfs = Arc::clone(&self.vfs);
        let mid = self.mount_id.clone();
        match self.rt.block_on(vfs.stat(&mid, &path)) {
            Ok(node) => {
                let mtime = Self::parse_mtime(node.modified.as_deref());
                let attr = self.make_attr(ino.0, node.is_dir, node.size.unwrap_or(0), mtime);
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
                for node in &nodes {
                    let child_ino = self.intern_path(node.path.clone());
                    all.push((child_ino, node.is_dir, node.name.clone()));
                }
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
        if let Some(file) = file {
            if file.dirty {
                let content = String::from_utf8_lossy(&file.data).to_string();
                let req = VfsWriteReq { mount_id: self.mount_id.clone(), path: file.path, content };
                let vfs = Arc::clone(&self.vfs);
                if let Err(e) = self.rt.block_on(vfs.write_file(&req)) {
                    tracing::warn!("FUSE release write-back failed: {e}");
                }
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
        let ino = self.intern_path(path);
        let attr = self.make_attr(ino, true, 0, SystemTime::now());
        reply.entry(&TTL, &attr, Generation(0));
    }

    fn unlink(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        self.remove_entry(parent, name, reply);
    }
    fn rmdir(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
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
            Ok(()) => { self.inodes.write().unwrap().remove(&src); reply.ok(); }
            Err(e) => { tracing::warn!("FUSE rename failed: {e}"); reply.error(Errno::EIO); }
        }
    }
}

// ── Mount entry point ─────────────────────────────────────────────────────────

pub(crate) async fn run_fuse_mount(
    mount_id: String,
    mount_point: String,
    vfs: Arc<VfsManager>,
    state: Arc<tokio::sync::RwLock<std::collections::HashMap<String, crate::manager::MountState>>>,
) {
    let rt = tokio::runtime::Handle::current();
    let id_clone = mount_id.clone();
    let result = tokio::task::spawn_blocking(move || {
        let fs = VfsFuse::new(mount_id.clone(), vfs, rt);
        let mut config = fuser::Config::default();
        config.mount_options = vec![
            MountOption::FSName(format!("ventoos-{mount_id}")),
            MountOption::DefaultPermissions,
        ];
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
