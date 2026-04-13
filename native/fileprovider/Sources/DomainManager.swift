// DomainManager.swift — Register / unregister FileProvider domains
//
// Each VentoOS VFS mount corresponds to one FileProvider domain.
// This helper wraps NSFileProviderManager domain management APIs.

import FileProvider

/// Manages FileProvider domains for VentoOS mounts.
///
/// Usage:
/// ```
/// DomainManager.registerDomain(mountId: "my-ssh", displayName: "My SSH")
/// DomainManager.unregisterDomain(mountId: "my-ssh")
/// ```
enum DomainManager {

    /// Domain identifier prefix — must match `Extension.domainPrefix`.
    private static let domainPrefix = "io.ventoos.vfs."

    // MARK: - Register

    /// Register a new FileProvider domain for a VentoOS mount.
    ///
    /// After registration the mount appears as a Finder sidebar location.
    ///
    /// - Parameters:
    ///   - mountId: The VentoOS mount identifier.
    ///   - displayName: Human-readable name shown in Finder.
    ///   - completion: Called when registration finishes (nil error = success).
    static func registerDomain(
        mountId: String,
        displayName: String,
        completion: ((Error?) -> Void)? = nil
    ) {
        let identifier = NSFileProviderDomainIdentifier(rawValue: domainPrefix + mountId)
        let domain = NSFileProviderDomain(identifier: identifier, displayName: displayName)

        NSFileProviderManager.add(domain) { error in
            if let error = error {
                logError("Failed to register domain '\(mountId)': \(error.localizedDescription)")
            } else {
                logInfo("Registered FileProvider domain '\(mountId)' (\(displayName))")
            }
            completion?(error)
        }
    }

    // MARK: - Unregister

    /// Remove a previously registered domain.
    ///
    /// - Parameters:
    ///   - mountId: The VentoOS mount identifier.
    ///   - completion: Called when removal finishes.
    static func unregisterDomain(
        mountId: String,
        completion: ((Error?) -> Void)? = nil
    ) {
        let identifier = NSFileProviderDomainIdentifier(rawValue: domainPrefix + mountId)
        let domain = NSFileProviderDomain(identifier: identifier, displayName: "")

        NSFileProviderManager.remove(domain) { error in
            if let error = error {
                logError("Failed to unregister domain '\(mountId)': \(error.localizedDescription)")
            } else {
                logInfo("Unregistered FileProvider domain '\(mountId)'")
            }
            completion?(error)
        }
    }

    // MARK: - List

    /// List all currently registered VentoOS FileProvider domains.
    ///
    /// - Parameter completion: Called with the array of domains or an error.
    static func listDomains(
        completion: @escaping ([NSFileProviderDomain]?, Error?) -> Void
    ) {
        NSFileProviderManager.getDomainsWithCompletionHandler { domains, error in
            if let error = error {
                logError("Failed to list domains: \(error.localizedDescription)")
                completion(nil, error)
                return
            }
            let ventoDomains = domains.filter {
                $0.identifier.rawValue.hasPrefix(domainPrefix)
            }
            completion(ventoDomains, nil)
        }
    }

    /// Synchronous convenience that blocks the calling thread.
    /// **Only** use from background threads / scripts, never from the main thread.
    static func listDomainsSync() -> [NSFileProviderDomain] {
        let semaphore = DispatchSemaphore(value: 0)
        var result: [NSFileProviderDomain] = []
        listDomains { domains, _ in
            result = domains ?? []
            semaphore.signal()
        }
        semaphore.wait()
        return result
    }

    // MARK: - Helpers

    /// Extract the mount ID from a domain identifier string.
    static func mountId(from domain: NSFileProviderDomain) -> String? {
        let raw = domain.identifier.rawValue
        guard raw.hasPrefix(domainPrefix) else { return nil }
        return String(raw.dropFirst(domainPrefix.count))
    }

    // MARK: - Logging

    private static func logInfo(_ message: String) {
        NSLog("[VentoFS] %@", message)
    }

    private static func logError(_ message: String) {
        NSLog("[VentoFS ERROR] %@", message)
    }
}
