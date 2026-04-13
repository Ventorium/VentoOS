// VentoAPIClient.swift — HTTP client for VentoOS VFS REST API
//
// Translates FileProvider operations into HTTP requests.
// Primary transport: HTTP/1.1 over Unix domain socket (~/.ventoos/server.sock).
// Fallback: HTTP over TCP (http://localhost:5454) when socket is unavailable.

import Foundation
import Network

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

// MARK: - UnixSocketHTTP

/// Raw HTTP/1.1 client over a Unix domain socket using NWConnection.
/// Used as the primary transport to reach the VentoOS server at
/// ~/.ventoos/server.sock without requiring a TCP port.
final class UnixSocketHTTP {
    let socketPath: String
    private let timeoutSeconds: Double

    init(socketPath: String, timeoutSeconds: Double = 10) {
        self.socketPath = socketPath
        self.timeoutSeconds = timeoutSeconds
    }

    /// Synchronous HTTP request over the Unix socket.
    /// Returns (HTTP status code, response body data).
    func request(
        method: String,
        path: String,
        headers: [String: String] = [:],
        body: Data? = nil
    ) throws -> (Int, Data) {
        let sema = DispatchSemaphore(value: 0)
        var resultStatus: Int = 0
        var resultBody = Data()
        var resultError: Error? = nil
        var receivedData = Data()
        var signaled = false

        let endpoint = NWEndpoint.unix(path: socketPath)
        let params = NWParameters.tcp
        let conn = NWConnection(to: endpoint, using: params)

        func signalOnce() {
            guard !signaled else { return }
            signaled = true
            sema.signal()
        }

        func tryParseResponse() {
            guard let headerRange = receivedData.range(of: Data("\r\n\r\n".utf8)) else { return }

            let headerData = receivedData[receivedData.startIndex..<headerRange.lowerBound]
            let headerStr = String(data: headerData, encoding: .utf8) ?? ""
            let headerLines = headerStr.components(separatedBy: "\r\n")

            // Parse status line: "HTTP/1.1 200 OK"
            if let statusLine = headerLines.first {
                let parts = statusLine.components(separatedBy: " ")
                resultStatus = parts.count > 1 ? (Int(parts[1]) ?? 0) : 0
            }

            // Find Content-Length if present
            var contentLength: Int? = nil
            for line in headerLines.dropFirst() {
                if line.lowercased().hasPrefix("content-length:") {
                    let val = line.dropFirst("content-length:".count).trimmingCharacters(in: .whitespaces)
                    contentLength = Int(val)
                }
            }

            let bodyStart = headerRange.upperBound
            if let cl = contentLength {
                let available = receivedData.distance(from: bodyStart, to: receivedData.endIndex)
                if available >= cl {
                    resultBody = Data(receivedData[bodyStart..<receivedData.index(bodyStart, offsetBy: cl)])
                    conn.cancel()
                    signalOnce()
                }
                // else: wait for more data
            } else {
                // No Content-Length — accumulate until connection closes
                resultBody = Data(receivedData[bodyStart...])
            }
        }

        func receive() {
            conn.receive(minimumIncompleteLength: 1, maximumLength: 65536) { data, _, isComplete, error in
                if let data = data, !data.isEmpty {
                    receivedData.append(data)
                    tryParseResponse()
                }
                if let error = error {
                    // NWError.posix(.ECANCELED) is expected when we call conn.cancel()
                    if case .posix(let code) = error, code == .ECANCELED { return }
                    resultError = error
                    signalOnce()
                    return
                }
                if isComplete {
                    if resultStatus == 0 { tryParseResponse() }
                    signalOnce()
                    return
                }
                if !signaled { receive() }
            }
        }

        conn.stateUpdateHandler = { state in
            switch state {
            case .ready:
                var reqStr = "\(method) \(path) HTTP/1.1\r\n"
                reqStr += "Host: localhost\r\n"
                for (k, v) in headers { reqStr += "\(k): \(v)\r\n" }
                if let body = body { reqStr += "Content-Length: \(body.count)\r\n" }
                reqStr += "Connection: close\r\n\r\n"
                var reqData = reqStr.data(using: .utf8)!
                if let body = body { reqData.append(body) }
                conn.send(content: reqData, completion: .idempotent)
                receive()
            case .failed(let error):
                resultError = error
                signalOnce()
            case .cancelled:
                // Expected when we cancel after a complete response
                break
            default:
                break
            }
        }

        conn.start(queue: .global(qos: .userInitiated))

        // Enforce timeout
        let deadline = DispatchTime.now() + timeoutSeconds
        if sema.wait(timeout: deadline) == .timedOut {
            conn.cancel()
            throw VentoAPIError.serverUnreachable
        }

        if let err = resultError { throw VentoAPIError.unknown(err) }
        if resultStatus == 0 { throw VentoAPIError.serverUnreachable }
        return (resultStatus, resultBody)
    }
}

// MARK: - VentoAPIClient

/// HTTP client for VentoOS VFS REST API.
///
/// Transport priority:
/// 1. Unix socket at `VENTOOS_SOCKET_PATH` (env) or `~/.ventoos/server.sock`
/// 2. HTTP over TCP at `VENTOOS_SERVER_URL` (env) or `http://localhost:5454`
///    (used as fallback when the socket file does not exist)
final class VentoAPIClient {

    /// Shared singleton.
    static let shared = VentoAPIClient()

    // MARK: Transport

    /// Resolved Unix socket path (may not exist at runtime).
    let socketPath: String
    /// Fallback HTTP base URL.
    let fallbackURL: String

    private let socketClient: UnixSocketHTTP
    private let session: URLSession
    private let decoder: JSONDecoder

    // MARK: Initialisation

    init(socketPath: String? = nil, serverURL: String? = nil) {
        // Socket path resolution: explicit → env VENTOOS_SOCKET_PATH → ~/.ventoos/server.sock
        let env = ProcessInfo.processInfo.environment
        if let explicit = socketPath {
            self.socketPath = explicit
        } else if let fromEnv = env["VENTOOS_SOCKET_PATH"] {
            self.socketPath = fromEnv
        } else {
            let home = env["HOME"] ?? NSHomeDirectory()
            self.socketPath = "\(home)/.ventoos/server.sock"
        }

        // Fallback HTTP URL: explicit → env VENTOOS_SERVER_URL → UserDefaults → default
        if let explicit = serverURL {
            self.fallbackURL = explicit
        } else if let fromEnv = env["VENTOOS_SERVER_URL"] {
            self.fallbackURL = fromEnv
        } else if let fromDefaults = UserDefaults(suiteName: "io.ventoos.shared")?.string(forKey: "serverURL") {
            self.fallbackURL = fromDefaults
        } else {
            self.fallbackURL = "http://localhost:5454"
        }

        self.socketClient = UnixSocketHTTP(socketPath: self.socketPath)

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 300
        self.session = URLSession(configuration: config)
        self.decoder = JSONDecoder()
    }

    /// True when the Unix socket file is present on disk.
    private var socketAvailable: Bool {
        FileManager.default.fileExists(atPath: socketPath)
    }

    // MARK: - Public API

    /// List directory contents.
    func listDir(mountId: String, path: String) throws -> [VfsNode] {
        let encoded = path.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? path
        let apiPath = "/api/vfs/mounts/\(mountId)/list?path=\(encoded)&show_hidden=true"
        let response: VentoResponse<[VfsNode]> = try requestJSON(.GET, apiPath: apiPath)
        return response.data ?? []
    }

    /// Stat a single item.
    func stat(mountId: String, path: String) throws -> VfsNode {
        let encoded = path.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? path
        let apiPath = "/api/vfs/mounts/\(mountId)/stat?path=\(encoded)"
        let response: VentoResponse<VfsNode> = try requestJSON(.GET, apiPath: apiPath)
        guard let node = response.data else {
            throw VentoAPIError.apiError(code: response.code, message: response.message ?? "No data")
        }
        return node
    }

    /// Download raw file bytes.
    func readFile(mountId: String, path: String) throws -> Data {
        let encoded = path.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? path
        let apiPath = "/api/vfs/mounts/\(mountId)/read-raw?path=\(encoded)"
        return try requestRaw(.GET, apiPath: apiPath)
    }

    /// Write (create or overwrite) a file.
    /// The VentoOS API expects JSON `{ path, content }` where `content`
    /// is the Base64-encoded file bytes.
    func writeFile(mountId: String, path: String, data: Data) throws {
        let apiPath = "/api/vfs/mounts/\(mountId)/write"
        let body: [String: Any] = [
            "path": path,
            "content": data.base64EncodedString()
        ]
        let _: VentoResponse<EmptyData> = try requestJSON(.POST, apiPath: apiPath, jsonBody: body)
    }

    /// Create a directory.
    func mkdir(mountId: String, path: String) throws {
        let apiPath = "/api/vfs/mounts/\(mountId)/mkdir"
        let body: [String: Any] = ["path": path]
        let _: VentoResponse<EmptyData> = try requestJSON(.POST, apiPath: apiPath, jsonBody: body)
    }

    /// Delete a file or directory.
    func delete(mountId: String, path: String) throws {
        let apiPath = "/api/vfs/mounts/\(mountId)/delete"
        let body: [String: Any] = ["path": path]
        let _: VentoResponse<EmptyData> = try requestJSON(.DELETE, apiPath: apiPath, jsonBody: body)
    }

    /// Move or rename a file/directory.
    func moveFile(mountId: String, src: String, dest: String) throws {
        let apiPath = "/api/vfs/mounts/\(mountId)/move"
        let body: [String: Any] = ["src": src, "dest": dest]
        let _: VentoResponse<EmptyData> = try requestJSON(.POST, apiPath: apiPath, jsonBody: body)
    }

    // MARK: - Internal Helpers

    private enum HTTPMethod: String {
        case GET, POST, PUT, DELETE
    }

    /// Placeholder for API responses with no meaningful `data`.
    private struct EmptyData: Decodable {}

    /// Perform a request and decode the JSON response into `T`.
    /// `apiPath` must start with "/" (e.g. "/api/vfs/mounts/x/list?path=...").
    private func requestJSON<T: Decodable>(
        _ method: HTTPMethod,
        apiPath: String,
        jsonBody: [String: Any]? = nil
    ) throws -> T {
        var bodyData: Data? = nil
        var extraHeaders: [String: String] = [:]
        if let body = jsonBody {
            bodyData = try JSONSerialization.data(withJSONObject: body)
            extraHeaders["Content-Type"] = "application/json"
        }

        let data = try performRequest(method: method, apiPath: apiPath, headers: extraHeaders, body: bodyData)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            let snippet = String(data: data.prefix(512), encoding: .utf8) ?? "<binary>"
            throw VentoAPIError.decodingError("\(error.localizedDescription) — body: \(snippet)")
        }
    }

    /// Perform a request and return raw response bytes.
    private func requestRaw(_ method: HTTPMethod, apiPath: String) throws -> Data {
        return try performRequest(method: method, apiPath: apiPath, headers: [:], body: nil)
    }

    /// Dispatch to socket or HTTP fallback, return response body bytes.
    private func performRequest(
        method: HTTPMethod,
        apiPath: String,
        headers: [String: String],
        body: Data?
    ) throws -> Data {
        if socketAvailable {
            let (status, data) = try socketClient.request(
                method: method.rawValue,
                path: apiPath,
                headers: headers,
                body: body
            )
            guard (200..<300).contains(status) else {
                let msg = String(data: data.prefix(512), encoding: .utf8) ?? ""
                throw VentoAPIError.httpError(statusCode: status, message: msg)
            }
            return data
        } else {
            // Fallback: plain HTTP over TCP
            let urlString = fallbackURL + apiPath
            guard let url = URL(string: urlString) else {
                throw VentoAPIError.invalidURL(urlString)
            }
            var request = URLRequest(url: url)
            request.httpMethod = method.rawValue
            for (k, v) in headers { request.setValue(v, forHTTPHeaderField: k) }
            request.httpBody = body

            let (data, _) = try performSyncHTTP(request)
            return data
        }
    }

    /// Execute a URLRequest synchronously using a semaphore (TCP fallback).
    private func performSyncHTTP(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
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
