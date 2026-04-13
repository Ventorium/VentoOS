# VentoFS — macOS FileProvider Extension for VentoOS VFS

VentoFS is an Apple FileProvider extension that integrates VentoOS VFS mounts
directly into macOS Finder. Remote filesystems (SSH/SFTP, S3, SMB, FTP …)
managed by VentoOS appear as native Finder locations — no macFUSE required.

## How it works

```
Finder  ←→  FileProvider.framework  ←→  VentoFS Extension  ←→  VentoOS Server (localhost:5454)
                                                                      ↕
                                                               Remote backends
```

Each VentoOS VFS mount is registered as a **FileProvider domain**.
The extension translates FileProvider operations (enumerate, fetch, create,
modify, delete, move) into HTTP calls to the VentoOS VFS REST API.

## Prerequisites

| Requirement | Minimum |
|-------------|---------|
| macOS       | 12.0 Monterey |
| Xcode CLI Tools | Xcode 14+ (for Swift 5.9+ and FileProvider SDK) |
| VentoOS server | Running on `localhost:5454` |

Install Xcode Command Line Tools if you haven't already:

```bash
xcode-select --install
```

## Build

```bash
# From the repository root
cd native/fileprovider
make build
```

Or directly:

```bash
./build.sh build
```

## Install

```bash
make install
```

This copies the built `VentoFS.app` (which embeds the `.appex` extension) into
`~/Library/VentoOS/` and asks macOS to register it.

## Uninstall

```bash
make uninstall
```

## Managing Domains

Once the extension is installed, VentoOS server manages domain registration
automatically. You can also use the `DomainManager` helper:

```swift
// Register a mount as a Finder location
DomainManager.registerDomain(mountId: "my-ssh-server", displayName: "My SSH Server")

// Remove it
DomainManager.unregisterDomain(mountId: "my-ssh-server")
```

## Configuration

The extension reads the VentoOS server URL from:

1. Shared `UserDefaults` suite `io.ventoos.shared` key `serverURL`
2. Environment variable `VENTOOS_SERVER_URL`
3. Defaults to `http://localhost:5454`

## Architecture

| File | Purpose |
|------|---------|
| `Sources/Extension.swift` | Main `NSFileProviderReplicatedExtension` — entry point |
| `Sources/FileProviderItem.swift` | Maps VFS nodes to `NSFileProviderItem` |
| `Sources/FileProviderEnumerator.swift` | Lists directory contents |
| `Sources/VentoAPIClient.swift` | HTTP client for VentoOS VFS API |
| `Sources/DomainManager.swift` | Register / unregister FileProvider domains |
| `Resources/Extension-Info.plist` | Extension bundle metadata |
| `Resources/Host-Info.plist` | Host app bundle metadata |
| `Resources/VentoFS.entitlements` | App sandbox entitlements |

## Item Identifier Encoding

Every item in the FileProvider is identified by a stable string:

```
Base64Encode(mount_id + ":" + vfs_path)
```

The root container of a domain maps to `.rootContainer`.

## License

Part of the VentoOS project.
