use std::time::Instant;

use base64::Engine;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};

use crate::models::KeyValue;
use crate::target_guard::validate_host;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct ProxyRequest {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Option<Vec<KeyValue>>,
    #[serde(default)]
    pub body: Option<ProxyBody>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub follow_redirects: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ProxyBody {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "json")]
    Json { content: serde_json::Value },
    #[serde(rename = "text")]
    Text {
        content: String,
        content_type: String,
    },
    #[serde(rename = "form-urlencoded")]
    FormUrlencoded { params: Vec<KeyValue> },
    #[serde(rename = "binary")]
    Binary { content: String },
}

#[derive(Debug, Serialize)]
pub struct ProxyResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<KeyValue>,
    pub body: String,
    pub duration_ms: u64,
    pub size_bytes: u64,
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error)]
pub enum ProxyError {
    #[error("Invalid HTTP method: {0}")]
    InvalidMethod(String),
    #[error("Invalid URL: {0}")]
    InvalidUrl(String),
    #[error("Request failed: {0}")]
    RequestFailed(#[from] reqwest::Error),
    #[error("Invalid header name: {0}")]
    InvalidHeaderName(String),
    #[error("Invalid header value: {0}")]
    InvalidHeaderValue(String),
    #[error("Invalid base64 body: {0}")]
    InvalidBase64(String),
    #[error("Target is not allowed: {0}")]
    ForbiddenTarget(String),
}

// ---------------------------------------------------------------------------
// Execute proxy request
// ---------------------------------------------------------------------------

pub async fn execute_proxy(req: ProxyRequest) -> Result<ProxyResponse, ProxyError> {
    let parsed_url = reqwest::Url::parse(&req.url).map_err(|error| ProxyError::InvalidUrl(error.to_string()))?;
    let host = parsed_url
        .host_str()
        .ok_or_else(|| ProxyError::ForbiddenTarget("target host is required".to_string()))?;
    validate_host(host).map_err(|error| ProxyError::ForbiddenTarget(error.to_string()))?;

    let method: reqwest::Method = req
        .method
        .parse()
        .map_err(|_| ProxyError::InvalidMethod(req.method.clone()))?;

    let mut builder = reqwest::Client::builder();

    if let Some(false) = req.follow_redirects {
        builder = builder.redirect(reqwest::redirect::Policy::none());
    }
    if let Some(ms) = req.timeout_ms {
        builder = builder.timeout(std::time::Duration::from_millis(ms));
    }

    let client = builder
        .build()
        .map_err(|e| ProxyError::InvalidUrl(e.to_string()))?;

    let mut request = client.request(method, parsed_url);

    // Headers
    if let Some(headers) = &req.headers {
        let mut map = HeaderMap::new();
        for kv in headers {
            if !kv.enabled {
                continue;
            }
            let name = HeaderName::try_from(&kv.key)
                .map_err(|_| ProxyError::InvalidHeaderName(kv.key.clone()))?;
            let value = HeaderValue::from_str(&kv.value)
                .map_err(|_| ProxyError::InvalidHeaderValue(kv.value.clone()))?;
            map.insert(name, value);
        }
        request = request.headers(map);
    }

    // Body
    if let Some(body) = &req.body {
        match body {
            ProxyBody::None => {}
            ProxyBody::Json { content } => {
                request = request.json(content);
            }
            ProxyBody::Text {
                content,
                content_type,
            } => {
                request = request
                    .header("Content-Type", content_type.as_str())
                    .body(content.clone());
            }
            ProxyBody::FormUrlencoded { params } => {
                let pairs: Vec<(&str, &str)> = params
                    .iter()
                    .filter(|kv| kv.enabled)
                    .map(|kv| (kv.key.as_str(), kv.value.as_str()))
                    .collect();
                request = request.form(&pairs);
            }
            ProxyBody::Binary { content } => {
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(content)
                    .map_err(|e| ProxyError::InvalidBase64(e.to_string()))?;
                request = request.body(bytes);
            }
        }
    }

    let start = Instant::now();
    let response = request.send().await?;
    #[allow(clippy::cast_possible_truncation)]
    let duration_ms = start.elapsed().as_millis() as u64;

    let status = response.status().as_u16();
    let status_text = response
        .status()
        .canonical_reason()
        .unwrap_or("")
        .to_string();

    let resp_headers: Vec<KeyValue> = response
        .headers()
        .iter()
        .map(|(k, v)| KeyValue {
            key: k.as_str().to_string(),
            value: v.to_str().unwrap_or("").to_string(),
            enabled: true,
        })
        .collect();

    let body_bytes = response.bytes().await?;
    let size_bytes = body_bytes.len() as u64;

    // Try to return as UTF-8 text; fall back to base64
    let body = if let Ok(s) = String::from_utf8(body_bytes.to_vec()) { s } else {
        let encoded = base64::engine::general_purpose::STANDARD.encode(&body_bytes);
        format!("data:application/octet-stream;base64,{encoded}")
    };

    Ok(ProxyResponse {
        status,
        status_text,
        headers: resp_headers,
        body,
        duration_ms,
        size_bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::{ProxyError, ProxyRequest, execute_proxy};

    #[tokio::test]
    async fn execute_proxy_rejects_loopback_targets() {
        let request = ProxyRequest {
            method: "GET".into(),
            url: "http://127.0.0.1:8080/health".into(),
            headers: None,
            body: None,
            timeout_ms: Some(500),
            follow_redirects: Some(false),
        };

        let error = execute_proxy(request).await.expect_err("loopback target should be rejected");
        assert!(matches!(error, ProxyError::ForbiddenTarget(_)));
    }
}
