use crate::models::{CodegenReq, CodegenResult, CodegenTarget, KeyValue};

/// Generate a code snippet for the given request.
pub fn generate(req: &CodegenReq) -> CodegenResult {
    match req.target {
        CodegenTarget::Curl => gen_curl(req),
        CodegenTarget::JavascriptFetch => gen_js_fetch(req),
        CodegenTarget::PythonRequests => gen_python_requests(req),
    }
}

// ---------------------------------------------------------------------------
// cURL
// ---------------------------------------------------------------------------

fn gen_curl(req: &CodegenReq) -> CodegenResult {
    let mut parts = vec![format!("curl -X {} '{}'", req.method.to_uppercase(), req.url)];

    if let Some(headers) = &req.headers {
        for h in headers {
            if h.enabled {
                parts.push(format!("  -H '{}: {}'", h.key, h.value));
            }
        }
    }

    if let Some(body) = &req.body
        && !body.is_null() {
            let body_str = if body.is_string() {
                body.as_str().unwrap_or("").to_string()
            } else {
                serde_json::to_string(body).unwrap_or_default()
            };
            if !body_str.is_empty() {
                parts.push(format!("  -d '{}'", body_str.replace('\'', "'\\''")));
            }
        }

    CodegenResult {
        target: "curl".into(),
        code: parts.join(" \\\n"),
    }
}

// ---------------------------------------------------------------------------
// JavaScript fetch
// ---------------------------------------------------------------------------

fn gen_js_fetch(req: &CodegenReq) -> CodegenResult {
    let mut lines = Vec::new();
    lines.push(format!("const response = await fetch('{}', {{", req.url));
    lines.push(format!("  method: '{}',", req.method.to_uppercase()));

    if let Some(headers) = &req.headers {
        let enabled: Vec<&KeyValue> = headers.iter().filter(|h| h.enabled).collect();
        if !enabled.is_empty() {
            lines.push("  headers: {".into());
            for h in &enabled {
                lines.push(format!("    '{}': '{}',", h.key, h.value));
            }
            lines.push("  },".into());
        }
    }

    if let Some(body) = &req.body
        && !body.is_null() {
            let body_str = serde_json::to_string_pretty(body).unwrap_or_default();
            lines.push(format!("  body: JSON.stringify({body_str}),"));
        }

    lines.push("});".into());
    lines.push(String::new());
    lines.push("const data = await response.json();".into());
    lines.push("console.log(data);".into());

    CodegenResult {
        target: "javascript_fetch".into(),
        code: lines.join("\n"),
    }
}

// ---------------------------------------------------------------------------
// Python requests
// ---------------------------------------------------------------------------

fn gen_python_requests(req: &CodegenReq) -> CodegenResult {
    let mut lines = Vec::new();
    lines.push("import requests".into());
    lines.push(String::new());

    let method = req.method.to_lowercase();

    if let Some(headers) = &req.headers {
        let enabled: Vec<&KeyValue> = headers.iter().filter(|h| h.enabled).collect();
        if !enabled.is_empty() {
            lines.push("headers = {".into());
            for h in &enabled {
                lines.push(format!("    '{}': '{}',", h.key, h.value));
            }
            lines.push("}".into());
            lines.push(String::new());
        }
    }

    let has_body = req.body.as_ref().is_some_and(|b| !b.is_null());
    if has_body {
        let body_str = serde_json::to_string_pretty(req.body.as_ref().unwrap()).unwrap_or_default();
        lines.push(format!("payload = {body_str}"));
        lines.push(String::new());
    }

    let mut call = format!("response = requests.{method}('{}'", req.url);
    if req.headers.as_ref().is_some_and(|h| h.iter().any(|kv| kv.enabled)) {
        call.push_str(", headers=headers");
    }
    if has_body {
        call.push_str(", json=payload");
    }
    call.push(')');
    lines.push(call);

    lines.push(String::new());
    lines.push("print(response.status_code)".into());
    lines.push("print(response.json())".into());

    CodegenResult {
        target: "python_requests".into(),
        code: lines.join("\n"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_curl_generation() {
        let req = CodegenReq {
            target: CodegenTarget::Curl,
            method: "POST".into(),
            url: "https://api.example.com/users".into(),
            headers: Some(vec![KeyValue {
                key: "Content-Type".into(),
                value: "application/json".into(),
                enabled: true,
            }]),
            body: Some(serde_json::json!({"name": "test"})),
        };
        let result = generate(&req);
        assert!(result.code.contains("curl -X POST"));
        assert!(result.code.contains("Content-Type: application/json"));
    }

    #[test]
    fn test_js_fetch_generation() {
        let req = CodegenReq {
            target: CodegenTarget::JavascriptFetch,
            method: "GET".into(),
            url: "https://api.example.com/users".into(),
            headers: None,
            body: None,
        };
        let result = generate(&req);
        assert!(result.code.contains("fetch("));
        assert!(result.code.contains("method: 'GET'"));
    }

    #[test]
    fn test_python_generation() {
        let req = CodegenReq {
            target: CodegenTarget::PythonRequests,
            method: "GET".into(),
            url: "https://api.example.com/users".into(),
            headers: None,
            body: None,
        };
        let result = generate(&req);
        assert!(result.code.contains("import requests"));
        assert!(result.code.contains("requests.get("));
    }
}
