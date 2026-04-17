// FileProviderItem.swift — Maps VentoOS VfsNode to NSFileProviderItem
//
// Each item is uniquely identified by Base64(mount_id + ":" + vfs_path).
// The root of a domain maps to NSFileProviderItemIdentifier.rootContainer.

import FileProvider
import UniformTypeIdentifiers

// MARK: - Identifier Helpers

/// Encode a (mountId, path) pair into an opaque item identifier string.
func encodeItemIdentifier(mountId: String, path: String) -> NSFileProviderItemIdentifier {
    let raw = "\(mountId):\(path)"
    let b64 = Data(raw.utf8).base64EncodedString()
    return NSFileProviderItemIdentifier(b64)
}

/// Decode an opaque identifier back into (mountId, path).
/// Returns `nil` for special identifiers like `.rootContainer`.
func decodeItemIdentifier(_ identifier: NSFileProviderItemIdentifier) -> (mountId: String, path: String)? {
    let raw = identifier.rawValue
    // Skip well-known identifiers
    if raw == NSFileProviderItemIdentifier.rootContainer.rawValue
        || raw == NSFileProviderItemIdentifier.workingSet.rawValue
        || raw == NSFileProviderItemIdentifier.trashContainer.rawValue {
        return nil
    }
    guard let data = Data(base64Encoded: raw),
          let decoded = String(data: data, encoding: .utf8) else {
        return nil
    }
    // Split on the first ":" — mount IDs must not contain ":"
    guard let colonIndex = decoded.firstIndex(of: ":") else { return nil }
    let mountId = String(decoded[decoded.startIndex..<colonIndex])
    let path = String(decoded[decoded.index(after: colonIndex)...])
    return (mountId, path)
}

/// Compute the parent identifier for a given path within a mount.
/// `/foo/bar` → identifier for `/foo`; `/foo` → rootContainer.
func parentIdentifier(mountId: String, path: String) -> NSFileProviderItemIdentifier {
    let nsPath = (path as NSString)
    let parent = nsPath.deletingLastPathComponent
    if parent == "/" || parent.isEmpty || parent == "." {
        return .rootContainer
    }
    return encodeItemIdentifier(mountId: mountId, path: parent)
}

// MARK: - FileProviderItem

/// Concrete `NSFileProviderItem` backed by a `VfsNode` from VentoOS.
final class FileProviderItem: NSObject, NSFileProviderItem {

    // MARK: Stored properties

    private let mountId: String
    private let node: VfsNode

    // MARK: Init

    init(mountId: String, node: VfsNode) {
        self.mountId = mountId
        self.node = node
        super.init()
    }

    // MARK: - NSFileProviderItem

    var itemIdentifier: NSFileProviderItemIdentifier {
        // The root directory must always return .rootContainer.
        if node.path == "/" {
            return .rootContainer
        }
        return encodeItemIdentifier(mountId: mountId, path: node.path)
    }

    var parentItemIdentifier: NSFileProviderItemIdentifier {
        return parentIdentifier(mountId: mountId, path: node.path)
    }

    var filename: String {
        return node.name
    }

    var contentType: UTType {
        if node.is_dir {
            return .folder
        }
        // Infer type from file extension; fall back to generic data.
        if let ext = node.name.split(separator: ".").last {
            return UTType(filenameExtension: String(ext)) ?? .data
        }
        return .data
    }

    var itemVersion: NSFileProviderItemVersion {
        // Use path + modification date as a content-based version.
        // The version changes whenever the file is modified.
        let versionString = "\(node.path)_\(node.modified ?? "")"
        return NSFileProviderItemVersion(
            contentVersion: Data(versionString.utf8),
            metadataVersion: Data(versionString.utf8)
        )
    }

    var capabilities: NSFileProviderItemCapabilities {
        if node.is_dir {
            return [.allowsReading, .allowsWriting, .allowsAddingSubItems,
                    .allowsContentEnumerating, .allowsDeleting, .allowsRenaming]
        }
        return [.allowsReading, .allowsWriting, .allowsDeleting, .allowsRenaming,
                .allowsReparenting]
    }

    var documentSize: NSNumber? {
        guard let size = node.size else { return nil }
        return NSNumber(value: size)
    }

    var contentModificationDate: Date? {
        return Self.parseDate(node.modified)
    }

    var creationDate: Date? {
        // VFS API doesn't provide creation date; reuse modified.
        return Self.parseDate(node.modified)
    }

    // MARK: - Date Parsing

    /// Attempts to parse an ISO-8601 string or a Unix timestamp string.
    private static func parseDate(_ value: String?) -> Date? {
        guard let value = value, !value.isEmpty else { return nil }
        // Try Unix timestamp (seconds since epoch)
        if let seconds = Double(value) {
            return Date(timeIntervalSince1970: seconds)
        }
        // Try ISO-8601
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) {
            return date
        }
        // Retry without fractional seconds
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
}
