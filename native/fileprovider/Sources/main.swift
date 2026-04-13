// main.swift — VentoFS CLI handler for FileProvider domain management
//
// The Rust backend calls this binary as:
//   VentoFS register <mountId> <displayName>
//   VentoFS unregister <mountId>
//   VentoFS status <mountId>     → prints "active" or "inactive"
//   VentoFS signal <mountId>
//   VentoFS cleanup

import Foundation
import FileProvider

let args = CommandLine.arguments
guard args.count >= 2 else {
    fputs("Usage: VentoFS <register|unregister|status|signal|cleanup> [args...]\n", stderr)
    exit(1)
}

let sema = DispatchSemaphore(value: 0)
var exitCode: Int32 = 0

func domainIdentifier(_ mountId: String) -> NSFileProviderDomainIdentifier {
    NSFileProviderDomainIdentifier(rawValue: "io.ventoos.vfs.\(mountId)")
}

switch args[1] {
case "register":
    guard args.count >= 4 else {
        fputs("Usage: VentoFS register <mountId> <displayName>\n", stderr)
        exit(1)
    }
    let domain = NSFileProviderDomain(identifier: domainIdentifier(args[2]), displayName: args[3])
    NSFileProviderManager.add(domain) { error in
        if let e = error {
            fputs("Error: \(e)\n", stderr)
            exitCode = 1
        } else {
            print("ok")
        }
        sema.signal()
    }
    sema.wait()

case "unregister":
    guard args.count >= 3 else {
        fputs("Usage: VentoFS unregister <mountId>\n", stderr)
        exit(1)
    }
    let domain = NSFileProviderDomain(identifier: domainIdentifier(args[2]), displayName: "")
    NSFileProviderManager.remove(domain) { error in
        if let e = error {
            fputs("Error: \(e)\n", stderr)
            exitCode = 1
        } else {
            print("ok")
        }
        sema.signal()
    }
    sema.wait()

case "status":
    guard args.count >= 3 else {
        fputs("Usage: VentoFS status <mountId>\n", stderr)
        exit(1)
    }
    let mountId = args[2]
    NSFileProviderManager.getDomainsWithCompletionHandler { domains, _ in
        let active = domains.contains { $0.identifier.rawValue == "io.ventoos.vfs.\(mountId)" }
        print(active ? "active" : "inactive")
        sema.signal()
    }
    sema.wait()

case "signal":
    guard args.count >= 3 else {
        fputs("Usage: VentoFS signal <mountId>\n", stderr)
        exit(1)
    }
    let domain = NSFileProviderDomain(identifier: domainIdentifier(args[2]), displayName: "")
    if let mgr = NSFileProviderManager(for: domain) {
        mgr.signalEnumerator(for: .workingSet) { error in
            if let e = error {
                fputs("Error: \(e)\n", stderr)
                exitCode = 1
            }
            sema.signal()
        }
    } else {
        fputs("Warning: no manager for domain \(args[2])\n", stderr)
        sema.signal()
    }
    sema.wait()

case "cleanup":
    NSFileProviderManager.getDomainsWithCompletionHandler { domains, _ in
        let vDomains = domains.filter { $0.identifier.rawValue.hasPrefix("io.ventoos.vfs.") }
        let group = DispatchGroup()
        for d in vDomains {
            group.enter()
            NSFileProviderManager.remove(d) { _ in group.leave() }
        }
        group.notify(queue: .global()) {
            print("cleaned \(vDomains.count)")
            sema.signal()
        }
    }
    sema.wait()

default:
    fputs("Unknown command: \(args[1])\n", stderr)
    exitCode = 1
}

exit(exitCode)
