// Extension.swift — Main NSFileProviderReplicatedExtension for VentoFS
//
// This is the entry point that macOS FileProvider framework instantiates.
// Each domain (= VentoOS mount) gets its own Extension instance.
//
// Domain identifier format: "io.ventoos.vfs.<mount_id>"

import FileProvider
import UniformTypeIdentifiers

/// Main extension class. macOS creates one per registered domain.
final class Extension: NSObject, NSFileProviderReplicatedExtension {

    /// Domain prefix — everything after this is the mount ID.
    private static let domainPrefix = "io.ventoos.vfs."

    /// The mount ID extracted from the domain identifier.
    let mountId: String

    /// Shared API client.
    let api: VentoAPIClient

    // MARK: - Lifecycle

    required init(domain: NSFileProviderDomain) {
        let identifier = domain.identifier.rawValue
        if identifier.hasPrefix(Self.domainPrefix) {
            self.mountId = String(identifier.dropFirst(Self.domainPrefix.count))
        } else {
            // Fallback: use the full identifier
            self.mountId = identifier
        }
        self.api = VentoAPIClient.shared
        super.init()
    }

    /// Called when macOS is done with this extension instance.
    func invalidate() {
        // No persistent resources to tear down.
    }

    // MARK: - Item Lookup

    func item(
        for identifier: NSFileProviderItemIdentifier,
        request _: NSFileProviderRequest,
        completionHandler: @escaping (NSFileProviderItem?, Error?) -> Void
    ) -> Progress {
        let progress = Progress(totalUnitCount: 1)

        // Root container → synthesise a virtual root node.
        if identifier == .rootContainer {
            let rootNode = VfsNode(name: "", path: "/", is_dir: true, size: nil, modified: nil)
            completionHandler(FileProviderItem(mountId: mountId, node: rootNode), nil)
            progress.completedUnitCount = 1
            return progress
        }

        guard let decoded = decodeItemIdentifier(identifier) else {
            completionHandler(nil, NSFileProviderError(.noSuchItem))
            progress.completedUnitCount = 1
            return progress
        }

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let node = try self.api.stat(mountId: decoded.mountId, path: decoded.path)
                completionHandler(FileProviderItem(mountId: self.mountId, node: node), nil)
            } catch {
                completionHandler(nil, Self.wrapError(error))
            }
            progress.completedUnitCount = 1
        }

        return progress
    }

    // MARK: - Fetch Contents

    func fetchContents(
        for itemIdentifier: NSFileProviderItemIdentifier,
        version _: NSFileProviderItemVersion?,
        request _: NSFileProviderRequest,
        completionHandler: @escaping (URL?, NSFileProviderItem?, Error?) -> Void
    ) -> Progress {
        let progress = Progress(totalUnitCount: 1)

        guard let decoded = decodeItemIdentifier(itemIdentifier) else {
            completionHandler(nil, nil, NSFileProviderError(.noSuchItem))
            progress.completedUnitCount = 1
            return progress
        }

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let data = try self.api.readFile(mountId: decoded.mountId, path: decoded.path)
                let node = try self.api.stat(mountId: decoded.mountId, path: decoded.path)

                // Write to a temporary file that FileProvider will manage.
                let tempDir = FileManager.default.temporaryDirectory
                    .appendingPathComponent("VentoFS", isDirectory: true)
                try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
                let tempFile = tempDir.appendingPathComponent(UUID().uuidString + "-" + node.name)
                try data.write(to: tempFile)

                let item = FileProviderItem(mountId: self.mountId, node: node)
                completionHandler(tempFile, item, nil)
            } catch {
                completionHandler(nil, nil, Self.wrapError(error))
            }
            progress.completedUnitCount = 1
        }

        return progress
    }

    // MARK: - Create Item

    func createItem(
        basedOn itemTemplate: NSFileProviderItem,
        fields _: NSFileProviderItemFields,
        contents url: URL?,
        options _: NSFileProviderCreateItemOptions = [],
        request _: NSFileProviderRequest,
        completionHandler: @escaping (NSFileProviderItem?, NSFileProviderItemFields, Bool, Error?) -> Void
    ) -> Progress {
        let progress = Progress(totalUnitCount: 1)

        // Determine the parent path.
        let parentPath: String
        if itemTemplate.parentItemIdentifier == .rootContainer {
            parentPath = "/"
        } else if let decoded = decodeItemIdentifier(itemTemplate.parentItemIdentifier) {
            parentPath = decoded.path
        } else {
            completionHandler(nil, [], false, NSFileProviderError(.noSuchItem))
            progress.completedUnitCount = 1
            return progress
        }

        let newPath = (parentPath as NSString).appendingPathComponent(itemTemplate.filename)

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                if itemTemplate.contentType == .folder {
                    try self.api.mkdir(mountId: self.mountId, path: newPath)
                } else if let fileURL = url, let data = try? Data(contentsOf: fileURL) {
                    try self.api.writeFile(mountId: self.mountId, path: newPath, data: data)
                } else {
                    // Create empty file
                    try self.api.writeFile(mountId: self.mountId, path: newPath, data: Data())
                }

                let node = try self.api.stat(mountId: self.mountId, path: newPath)
                let item = FileProviderItem(mountId: self.mountId, node: node)
                completionHandler(item, [], false, nil)
            } catch {
                completionHandler(nil, [], false, Self.wrapError(error))
            }
            progress.completedUnitCount = 1
        }

        return progress
    }

    // MARK: - Modify Item

    func modifyItem(
        _ item: NSFileProviderItem,
        baseVersion _: NSFileProviderItemVersion,
        changedFields: NSFileProviderItemFields,
        contents url: URL?,
        options _: NSFileProviderModifyItemOptions = [],
        request _: NSFileProviderRequest,
        completionHandler: @escaping (NSFileProviderItem?, NSFileProviderItemFields, Bool, Error?) -> Void
    ) -> Progress {
        let progress = Progress(totalUnitCount: 1)

        guard let decoded = decodeItemIdentifier(item.itemIdentifier) else {
            completionHandler(nil, [], false, NSFileProviderError(.noSuchItem))
            progress.completedUnitCount = 1
            return progress
        }

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                var currentPath = decoded.path

                // Handle rename / reparent
                if changedFields.contains(.filename) || changedFields.contains(.parentItemIdentifier) {
                    let newParentPath: String
                    if item.parentItemIdentifier == .rootContainer {
                        newParentPath = "/"
                    } else if let parentDecoded = decodeItemIdentifier(item.parentItemIdentifier) {
                        newParentPath = parentDecoded.path
                    } else {
                        newParentPath = "/"
                    }
                    let destPath = (newParentPath as NSString).appendingPathComponent(item.filename)
                    if destPath != currentPath {
                        try self.api.moveFile(mountId: self.mountId, src: currentPath, dest: destPath)
                        currentPath = destPath
                    }
                }

                // Handle content update
                if changedFields.contains(.contents), let fileURL = url {
                    let data = try Data(contentsOf: fileURL)
                    try self.api.writeFile(mountId: self.mountId, path: currentPath, data: data)
                }

                let node = try self.api.stat(mountId: self.mountId, path: currentPath)
                let updatedItem = FileProviderItem(mountId: self.mountId, node: node)
                completionHandler(updatedItem, [], false, nil)
            } catch {
                completionHandler(nil, [], false, Self.wrapError(error))
            }
            progress.completedUnitCount = 1
        }

        return progress
    }

    // MARK: - Delete Item

    func deleteItem(
        identifier: NSFileProviderItemIdentifier,
        baseVersion _: NSFileProviderItemVersion,
        options _: NSFileProviderDeleteItemOptions = [],
        request _: NSFileProviderRequest,
        completionHandler: @escaping (Error?) -> Void
    ) -> Progress {
        let progress = Progress(totalUnitCount: 1)

        guard let decoded = decodeItemIdentifier(identifier) else {
            completionHandler(NSFileProviderError(.noSuchItem))
            progress.completedUnitCount = 1
            return progress
        }

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try self.api.delete(mountId: decoded.mountId, path: decoded.path)
                completionHandler(nil)
            } catch {
                completionHandler(Self.wrapError(error))
            }
            progress.completedUnitCount = 1
        }

        return progress
    }

    // MARK: - Enumerator

    func enumerator(
        for containerItemIdentifier: NSFileProviderItemIdentifier,
        request _: NSFileProviderRequest
    ) throws -> NSFileProviderEnumerator {
        return FileProviderEnumerator(
            container: containerItemIdentifier,
            mountId: mountId,
            api: api
        )
    }

    // MARK: - Helpers

    /// Convert domain errors to NSFileProviderError where appropriate.
    private static func wrapError(_ error: Error) -> NSError {
        if let apiErr = error as? VentoAPIError {
            switch apiErr {
            case .serverUnreachable:
                return NSFileProviderError(.serverUnreachable) as NSError
            case .httpError(let code, _) where code == 404:
                return NSFileProviderError(.noSuchItem) as NSError
            default:
                return NSFileProviderError(.cannotSynchronize) as NSError
            }
        }
        return error as NSError
    }
}
