// VentoAPIClient.swift — HTTP client for VentoOS VFS REST API
//
// Translates FileProvider operations into HTTP requests targeting
// the VentoOS server (default http://localhost:5454).

import Foundation

// MARK: - Error Types

/// Errors that can occur when communicating with VentoOS.
enum VentoAPIError: Error, LocalizedError {
    case serverUnreachable
    case httpError(statusCode: Int, message: String)
    case decodingError(String)
    case invalidURL(String)
    case apiError(code: Int, message: String)
    case unknown(Error)

    var errorDescription: String? {
        switch self {
        case .serverUnreachable:
            return "VentoOS server is unreachable."
        case .httpError(let code, let msg):
            return "HTTP \(code): \(msg)"
        case .decodingError(let detail):
            return "Failed to decode response: \(detail)"
        case .invalidURL(let url):
            return "Invalid URL: \(url)"
        case .apiError(let code, let msg):
            return "API error \(code): \(msg)"
        case .unknown(let err):
            return "Unknown error: \(err.localizedDescription)"
        }
    }
}

// MARK: - API Response Models

/// Top-level JSON envelope returned by VentoOS: `{ code, data, message }`.
struct VentoResponse<T: Decodable>: Decodable {
    let code: Int
    let data: T?
    let message: String?
}

/// A single filesystem node as returned by the VFS API.
struct VfsNode: Decodable {
    let name: String
    let path: String
    let is_dir: Bool
    let size: UInt64?
    let modified: String? // ISO-8601 or Unix timestamp string
}

// MARK: - VentoAPIClient

/// Synchronous-style HTTP client that wraps `URLSession` with
/// semaphore-based waiting so FileProvider completion handlers
/// can call it directly from their callback queues.
final class VentoAPIClient {

    /// Shared singleton — safe because URLSession is thread-safe.
    static let shared = VentoAPIClient()

    /// Base URL of the VentoOS server.
    let serverURL: String

    private let session: URLSession
    private let decoder: JSONDecoder

    // MARK: Initialisation

    init(serverURL: String? = nil) {
        // Resolution order: explicit → UserDefaults → env → default
        if let explicit = serverURL {
            self.serverURL = explicit
        } else if let fromDefaults = UserDefaults(suiteName: "io.ventoos.shared")?.string(forKey: "serverURL") {
            self.serverURL = fromDefaults
        } else if let fromEnv = ProcessInfo.processInfo.environment["VENTOOS_SERVER_URL"] {
            self.serverURL = fromEnv
        } else {
            self.serverURL = "http://localhost:5454"
        }

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 300
        self.session = URLSession(configuration: config)
        self.decoder = JSONDecoder()
    }

    // MARK: - Public API

    /// List directory contents.
    func listDir(mountId: String, path: String) throws -> [VfsNode] {
        let encoded = path.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? path
        let url = "\(serverURL)/api/vfs/mounts/\(mountId)/list?path=\(encoded)&show_hidden=true"
        let response: VentoResponse<[VfsNode]> = try requestJSON(.GET, url: url)
        return response.data ?? []
    }

    /// Stat a single item.
    func stat(mountId: String, path: String) throws -> VfsNode {
        let encoded = path.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? path
        let url = "\(serverURL)/api/vfs/mounts/\(mountId)/stat?path=\(encoded)"
        let response: VentoResponse<VfsNode> = try requestJSON(.GET, url: url)
        guard let node = response.data else {
            throw VentoAPIError.apiError(code: response.code, message: response.message ?? "No data")
        }
        return node
    }

    /// Download raw file bytes.
    func readFile(mountId: String, path: String) throws -> Data {
        let encoded = path.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? path
        let url = "\(serverURL)/api/vfs/mounts/\(mountId)/read-raw?path=\(encoded)"
        return try requestRaw(.GET, url: url)
    }

    /// Write (create or overwrite) a file.
    /// The VentoOS API expects JSON `{ path, content }` where `content`
    /// is the Base64-encoded file bytes.
    func writeFile(mountId: String, path: String, data: Data) throws {
        let url = "\(serverURL)/api/vfs/mounts/\(mountId)/write"
        let body: [String: Any] = [
            "path": path,
            "content": data.base64EncodedString()
        ]
        let _: VentoResponse<EmptyData> = try requestJSON(.POST, url: url, jsonBody: body)
    }

    /// Create a directory.
    func mkdir(mountId: String, path: String) throws {
        let url = "\(serverURL)/api/vfs/mounts/\(mountId)/mkdir"
        let body: [String: Any] = ["path": path]
        let _: VentoResponse<EmptyData> = try requestJSON(.POST, url: url, jsonBody: body)
    }

    /// Delete a file or directory.
    func delete(mountId: String, path: String) throws {
        let url = "\(serverURL)/api/vfs/mounts/\(mountId)/delete"
        let body: [String: Any] = ["path": path]
        let _: VentoResponse<EmptyData> = try requestJSON(.DELETE, url: url, jsonBody: body)
    }

    /// Move or rename a file/directory.
    func moveFile(mountId: String, src: String, dest: String) throws {
        let url = "\(serverURL)/api/vfs/mounts/\(mountId)/move"
        let body: [String: Any] = ["src": src, "dest": dest]
        let _: VentoResponse<EmptyData> = try requestJSON(.POST, url: url, jsonBody: body)
    }

    // MARK: - Internal Helpers

    private enum HTTPMethod: String {
        case GET, POST, PUT, DELETE
    }

    /// Placeholder for API responses with no meaningful `data`.
    private struct EmptyData: Decodable {}

    /// Perform a request and decode the JSON response into `T`.
    private func requestJSON<T: Decodable>(
        _ method: HTTPMethod,
        url urlString: String,
        jsonBody: [String: Any]? = nil
    ) throws -> T {
        guard let url = URL(string: urlString) else {
            throw VentoAPIError.invalidURL(urlString)
        }

        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue

        if let body = jsonBody {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        let (data, _) = try performSync(request)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            let snippet = String(data: data.prefix(512), encoding: .utf8) ?? "<binary>"
            throw VentoAPIError.decodingError("\(error.localizedDescription) — body: \(snippet)")
        }
    }

    /// Perform a request and return raw response bytes.
    private func requestRaw(_ method: HTTPMethod, url urlString: String) throws -> Data {
        guard let url = URL(string: urlString) else {
            throw VentoAPIError.invalidURL(urlString)
        }
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        let (data, _) = try performSync(request)
        return data
    }

    /// Execute a URLRequest synchronously using a semaphore.
    private func performSync(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
        let semaphore = DispatchSemaphore(value: 0)
        var resultData: Data?
        var resultResponse: HTTPURLResponse?
        var resultError: Error?

        let task = session.dataTask(with: request) { data, response, error in
            resultData = data
            resultResponse = response as? HTTPURLResponse
            resultError = error
            semaphore.signal()
        }
        task.resume()
        semaphore.wait()

        if let error = resultError {
            // NSURLErrorCannotConnectToHost, NSURLErrorTimedOut, etc.
            let nsError = error as NSError
            if nsError.domain == NSURLErrorDomain {
                throw VentoAPIError.serverUnreachable
            }
            throw VentoAPIError.unknown(error)
        }

        guard let data = resultData, let response = resultResponse else {
            throw VentoAPIError.serverUnreachable
        }

        guard (200..<300).contains(response.statusCode) else {
            let body = String(data: data.prefix(512), encoding: .utf8) ?? ""
            throw VentoAPIError.httpError(statusCode: response.statusCode, message: body)
        }

        return (data, response)
    }
}
