// VentoAPIClient.swift — HTTP client for VentoOS VFS REST API
//
// Translates FileProvider operations into HTTP requests.
// Transport: HTTP over TCP (http://localhost:5454).

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

/// Top-level JSON envelope returned by VentoOS: `{ success, data, message }`.
struct VentoResponse<T: Decodable>: Decodable {
    let success: Bool
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

/// HTTP client for VentoOS VFS REST API.
///
/// Communicates with VentoOS over HTTP on `localhost:5454`.
/// Uses async/await to avoid DispatchSemaphore deadlocks in the
/// sandboxed FileProvider extension.
final class VentoAPIClient {

    /// Shared singleton.
    static let shared = VentoAPIClient()

    // MARK: Transport

    /// HTTP base URL for VentoOS server.
    let serverURL: String

    private let session: URLSession
    private let decoder: JSONDecoder

    /// Bearer token read from `.fp-token` (written by VentoOS server).
    private let authToken: String?

    // MARK: Initialisation

    init(serverURL: String? = nil) {
        let env = ProcessInfo.processInfo.environment
        if let explicit = serverURL {
            self.serverURL = explicit
        } else if let fromEnv = env["VENTOOS_SERVER_URL"] {
            self.serverURL = fromEnv
        } else {
            self.serverURL = "http://localhost:5454"
        }

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 300
        self.session = URLSession(configuration: config)
        self.decoder = JSONDecoder()

        self.authToken = Self.loadToken()
    }

    // MARK: - Public API

    /// List directory contents.
    func listDir(mountId: String, path: String) async throws -> [VfsNode] {
        let encoded = path.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? path
        var apiPath = "/api/vfs/mounts/\(mountId)/ls?path=\(encoded)&show_hidden=true"
        if let token = authToken {
            apiPath += "&token=\(token)"
        }
        NSLog("[VentoFS] listDir: %@", apiPath)
        let response: VentoResponse<[VfsNode]> = try await requestJSON(.GET, apiPath: apiPath)
        NSLog("[VentoFS] listDir done: %d items", response.data?.count ?? 0)
        return response.data ?? []
    }

    /// Stat a single item.
    func stat(mountId: String, path: String) async throws -> VfsNode {
        let encoded = path.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? path
        var apiPath = "/api/vfs/mounts/\(mountId)/stat?path=\(encoded)"
        if let token = authToken {
            apiPath += "&token=\(token)"
        }
        NSLog("[VentoFS] stat: %@", apiPath)
        let response: VentoResponse<VfsNode> = try await requestJSON(.GET, apiPath: apiPath)
        NSLog("[VentoFS] stat done: success=%@", response.success ? "true" : "false")
        guard let node = response.data else {
            throw VentoAPIError.apiError(code: response.success ? 0 : -1, message: response.message ?? "No data")
        }
        return node
    }

    /// Download raw file bytes.
    func readFile(mountId: String, path: String) async throws -> Data {
        let encoded = path.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? path
        var apiPath = "/api/vfs/mounts/\(mountId)/raw?path=\(encoded)"
        if let token = authToken {
            apiPath += "&token=\(token)"
        }
        return try await requestRaw(.GET, apiPath: apiPath)
    }

    /// Write (create or overwrite) a file.
    func writeFile(mountId: String, path: String, data: Data) async throws {
        let apiPath = "/api/vfs/mounts/\(mountId)/write"
        let body: [String: Any] = [
            "path": path,
            "content": data.base64EncodedString()
        ]
        let _: VentoResponse<EmptyData> = try await requestJSON(.POST, apiPath: apiPath, jsonBody: body)
    }

    /// Create a directory.
    func mkdir(mountId: String, path: String) async throws {
        let apiPath = "/api/vfs/mounts/\(mountId)/mkdir"
        let body: [String: Any] = ["path": path]
        let _: VentoResponse<EmptyData> = try await requestJSON(.POST, apiPath: apiPath, jsonBody: body)
    }

    /// Delete a file or directory.
    func delete(mountId: String, path: String) async throws {
        let apiPath = "/api/vfs/mounts/\(mountId)/delete"
        let body: [String: Any] = ["path": path]
        let _: VentoResponse<EmptyData> = try await requestJSON(.DELETE, apiPath: apiPath, jsonBody: body)
    }

    /// Move or rename a file/directory.
    func moveFile(mountId: String, src: String, dest: String) async throws {
        let apiPath = "/api/vfs/mounts/\(mountId)/move"
        let body: [String: Any] = ["src": src, "dest": dest]
        let _: VentoResponse<EmptyData> = try await requestJSON(.POST, apiPath: apiPath, jsonBody: body)
    }

    // MARK: - Token Loading

    /// Read the FileProvider auth token from the shared file.
    /// The extension runs in a sandbox, so NSHomeDirectory() returns the
    /// container path.  We look there first, then fall back to the real
    /// home directory (resolved via getpwuid) for non-sandboxed use.
    private static func loadToken() -> String? {
        // 1. Try the container directory first (sandboxed extension)
        let containerUrl = URL(fileURLWithPath: NSHomeDirectory())
            .appendingPathComponent(".fp-token")
        NSLog("[VentoFS] loadToken: trying container %@", containerUrl.path)
        if let content = try? String(contentsOf: containerUrl, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines), !content.isEmpty {
            NSLog("[VentoFS] loadToken: found in container")
            return content
        }

        // 2. Try the real home directory (for non-sandboxed or dev use)
        guard let pw = getpwuid(getuid()), let dir = pw.pointee.pw_dir else {
            NSLog("[VentoFS] loadToken: failed to resolve home dir")
            return nil
        }
        let home = String(cString: dir)
        let homeUrl = URL(fileURLWithPath: home)
            .appendingPathComponent("Library/VentoOS/.fp-token")
        NSLog("[VentoFS] loadToken: trying home %@", homeUrl.path)
        if let content = try? String(contentsOf: homeUrl, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines), !content.isEmpty {
            NSLog("[VentoFS] loadToken: found in home")
            return content
        }
        NSLog("[VentoFS] loadToken: not found anywhere")
        return nil
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
        apiPath: String,
        jsonBody: [String: Any]? = nil
    ) async throws -> T {
        var bodyData: Data? = nil
        var extraHeaders: [String: String] = [:]
        if let body = jsonBody {
            bodyData = try JSONSerialization.data(withJSONObject: body)
            extraHeaders["Content-Type"] = "application/json"
        }
        let data = try await performRequest(method: method, apiPath: apiPath, headers: extraHeaders, body: bodyData)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            let snippet = String(data: data.prefix(512), encoding: .utf8) ?? "<binary>"
            throw VentoAPIError.decodingError("\(error.localizedDescription) — body: \(snippet)")
        }
    }

    /// Perform a request and return raw response bytes.
    private func requestRaw(_ method: HTTPMethod, apiPath: String) async throws -> Data {
        return try await performRequest(method: method, apiPath: apiPath, headers: [:], body: nil)
    }

    /// Execute HTTP request via URLSession async/await.
    private func performRequest(
        method: HTTPMethod,
        apiPath: String,
        headers: [String: String],
        body: Data?
    ) async throws -> Data {
        let urlString = serverURL + apiPath
        NSLog("[VentoFS] performRequest: %@ %@", method.rawValue, urlString)
        guard let url = URL(string: urlString) else {
            throw VentoAPIError.invalidURL(urlString)
        }
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        for (k, v) in headers { request.setValue(v, forHTTPHeaderField: k) }
        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = body

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            let nsError = error as NSError
            NSLog("[VentoFS] request error: %@ (%d)", nsError.domain, nsError.code)
            if nsError.domain == NSURLErrorDomain { throw VentoAPIError.serverUnreachable }
            throw VentoAPIError.unknown(error)
        }
        guard let httpResponse = response as? HTTPURLResponse else {
            throw VentoAPIError.serverUnreachable
        }
        NSLog("[VentoFS] response status: %d", httpResponse.statusCode)
        guard (200..<300).contains(httpResponse.statusCode) else {
            let msg = String(data: data.prefix(512), encoding: .utf8) ?? ""
            throw VentoAPIError.httpError(statusCode: httpResponse.statusCode, message: msg)
        }
        return data
    }
}
