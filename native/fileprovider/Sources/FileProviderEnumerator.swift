// FileProviderEnumerator.swift — Enumerates items in a VentoOS VFS directory
//
// Implements NSFileProviderEnumerator to feed Finder with directory listings
// fetched from the VentoOS VFS list API.

import FileProvider

/// Enumerator for a single container (directory) or the working set.
final class FileProviderEnumerator: NSObject, NSFileProviderEnumerator {

    /// What we are enumerating.
    private let containerIdentifier: NSFileProviderItemIdentifier
    private let mountId: String
    private let api: VentoAPIClient

    // MARK: Init

    /// - Parameters:
    ///   - container: The item identifier of the directory to enumerate,
    ///                or `.workingSet` / `.rootContainer`.
    ///   - mountId: The VentoOS mount this domain is bound to.
    ///   - api: Shared API client instance.
    init(container: NSFileProviderItemIdentifier, mountId: String, api: VentoAPIClient = .shared) {
        self.containerIdentifier = container
        self.mountId = mountId
        self.api = api
        super.init()
    }

    // MARK: - NSFileProviderEnumerator

    /// Called when Finder no longer needs this enumerator.
    func invalidate() {
        // Nothing to clean up — we hold no persistent resources.
    }

    /// Enumerate items within the container.
    func enumerateItems(
        for observer: NSFileProviderEnumerationObserver,
        startingAt page: NSFileProviderPage
    ) {
        // Working set: return empty for now (we don't track recently used items yet).
        if containerIdentifier == .workingSet {
            observer.finishEnumerating(upTo: nil)
            return
        }

        let dirPath = resolvedPath()

        Task {
            do {
                let nodes = try await api.listDir(mountId: mountId, path: dirPath)
                let items = nodes.map { FileProviderItem(mountId: mountId, node: $0) }
                observer.didEnumerate(items)
                observer.finishEnumerating(upTo: nil)
            } catch {
                observer.finishEnumeratingWithError(
                    Self.wrapError(error, item: containerIdentifier)
                )
            }
        }
    }

    /// Enumerate changes since the given sync anchor.
    /// Initial implementation: always return the full listing with a new anchor.
    func enumerateChanges(
        for observer: NSFileProviderChangeObserver,
        from syncAnchor: NSFileProviderSyncAnchor
    ) {
        if containerIdentifier == .workingSet {
            let newAnchor = Self.currentSyncAnchor()
            observer.finishEnumeratingChanges(upTo: newAnchor, moreComing: false)
            return
        }

        let dirPath = resolvedPath()

        Task {
            do {
                let nodes = try await api.listDir(mountId: mountId, path: dirPath)
                let items = nodes.map { FileProviderItem(mountId: mountId, node: $0) }
                observer.didUpdate(items)
                let newAnchor = Self.currentSyncAnchor()
                observer.finishEnumeratingChanges(upTo: newAnchor, moreComing: false)
            } catch {
                observer.finishEnumeratingWithError(
                    Self.wrapError(error, item: containerIdentifier)
                )
            }
        }
    }

    /// Return the current sync anchor.
    func currentSyncAnchor(completionHandler: @escaping (NSFileProviderSyncAnchor?) -> Void) {
        completionHandler(Self.currentSyncAnchor())
    }

    // MARK: - Helpers

    /// Resolve the VFS path for the container we are enumerating.
    private func resolvedPath() -> String {
        if containerIdentifier == .rootContainer {
            return "/"
        }
        if let decoded = decodeItemIdentifier(containerIdentifier) {
            return decoded.path
        }
        return "/"
    }

    /// Build a sync anchor from the current timestamp.
    private static func currentSyncAnchor() -> NSFileProviderSyncAnchor {
        let stamp = "\(Date().timeIntervalSince1970)"
        return NSFileProviderSyncAnchor(stamp.data(using: .utf8)!)
    }

    /// Wrap domain-specific errors into `NSFileProviderError` where possible.
    private static func wrapError(_ error: Error, item: NSFileProviderItemIdentifier) -> NSError {
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
