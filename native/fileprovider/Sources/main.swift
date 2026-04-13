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

func parseArguments(_ rawArgs: [String]) -> ([String], String?) {
    var parsed: [String] = []
    var resultFile: String? = nil
    var index = 0

    while index < rawArgs.count {
        let value = rawArgs[index]
        if value == "--result-file", index + 1 < rawArgs.count {
            resultFile = rawArgs[index + 1]
            index += 2
            continue
        }
        parsed.append(value)
        index += 1
    }

    return (parsed, resultFile)
}

let (effectiveArgs, resultFile) = parseArguments(args)

let sema = DispatchSemaphore(value: 0)
var exitCode: Int32 = 0

func persistResult(_ message: String) {
    guard let resultFile else { return }
    do {
        let url = URL(fileURLWithPath: resultFile)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try message.write(toFile: resultFile, atomically: true, encoding: .utf8)
    } catch {
        fputs("Warning: failed to write result file: \(error)\n", stderr)
    }
}

func domainIdentifier(_ mountId: String) -> NSFileProviderDomainIdentifier {
    NSFileProviderDomainIdentifier(rawValue: "io.ventoos.vfs.\(mountId)")
}

switch effectiveArgs[1] {
case "register":
    guard effectiveArgs.count >= 4 else {
        fputs("Usage: VentoFS register <mountId> <displayName>\n", stderr)
        exit(1)
    }
    let domain = NSFileProviderDomain(identifier: domainIdentifier(effectiveArgs[2]), displayName: effectiveArgs[3])
    NSFileProviderManager.add(domain) { error in
        if let e = error {
            persistResult("error: \(e)")
            fputs("Error: \(e)\n", stderr)
            exitCode = 1
        } else {
            persistResult("ok")
            print("ok")
        }
        sema.signal()
    }
    sema.wait()

case "unregister":
    guard effectiveArgs.count >= 3 else {
        fputs("Usage: VentoFS unregister <mountId>\n", stderr)
        exit(1)
    }
    let domain = NSFileProviderDomain(identifier: domainIdentifier(effectiveArgs[2]), displayName: "")
    NSFileProviderManager.remove(domain) { error in
        if let e = error {
            persistResult("error: \(e)")
            fputs("Error: \(e)\n", stderr)
            exitCode = 1
        } else {
            persistResult("ok")
            print("ok")
        }
        sema.signal()
    }
    sema.wait()

case "status":
    guard effectiveArgs.count >= 3 else {
        fputs("Usage: VentoFS status <mountId>\n", stderr)
        exit(1)
    }
    let mountId = effectiveArgs[2]
    NSFileProviderManager.getDomainsWithCompletionHandler { domains, _ in
        let active = domains.contains { $0.identifier.rawValue == "io.ventoos.vfs.\(mountId)" }
        persistResult(active ? "active" : "inactive")
        print(active ? "active" : "inactive")
        sema.signal()
    }
    sema.wait()

case "signal":
    guard effectiveArgs.count >= 3 else {
        fputs("Usage: VentoFS signal <mountId>\n", stderr)
        exit(1)
    }
    let domain = NSFileProviderDomain(identifier: domainIdentifier(effectiveArgs[2]), displayName: "")
    if let mgr = NSFileProviderManager(for: domain) {
        mgr.signalEnumerator(for: .workingSet) { error in
            if let e = error {
                persistResult("error: \(e)")
                fputs("Error: \(e)\n", stderr)
                exitCode = 1
            } else {
                persistResult("ok")
            }
            sema.signal()
        }
    } else {
        persistResult("warning: no manager")
        fputs("Warning: no manager for domain \(effectiveArgs[2])\n", stderr)
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
            persistResult("cleaned \(vDomains.count)")
            print("cleaned \(vDomains.count)")
            sema.signal()
        }
    }
    sema.wait()

default:
    fputs("Unknown command: \(effectiveArgs[1])\n", stderr)
    exitCode = 1
}

exit(exitCode)
