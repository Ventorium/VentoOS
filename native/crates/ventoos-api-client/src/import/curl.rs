#![allow(clippy::too_many_lines)]

use uuid::Uuid;

use crate::models::{ApiRequest, Collection, ImportResult};

/// Parse a cURL command string and convert it into a single-request collection.
pub fn import_curl(input: &str) -> Result<ImportResult, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let collection_id = Uuid::new_v4().to_string();

    // Normalize line continuations
    let normalized = input
        .replace("\\\n", " ")
        .replace("\\\r\n", " ");
    let tokens = shell_tokenize(&normalized)?;

    if tokens.is_empty() || tokens[0] != "curl" {
        return Err("Input does not start with 'curl'".into());
    }

    let mut method = String::from("GET");
    let mut url = String::new();
    let mut headers: Vec<serde_json::Value> = Vec::new();
    let mut body: Option<serde_json::Value> = None;

    let mut i = 1;
    while i < tokens.len() {
        let tok = &tokens[i];
        match tok.as_str() {
            "-X" | "--request" => {
                i += 1;
                if i < tokens.len() {
                    method = tokens[i].to_uppercase();
                }
            }
            "-H" | "--header" => {
                i += 1;
                if i < tokens.len()
                    && let Some((key, value)) = tokens[i].split_once(':') {
                        headers.push(serde_json::json!({
                            "key": key.trim(),
                            "value": value.trim(),
                            "enabled": true
                        }));
                    }
            }
            "-d" | "--data" | "--data-raw" | "--data-binary" => {
                i += 1;
                if i < tokens.len() {
                    let data = &tokens[i];
                    // If method is still GET, switch to POST
                    if method == "GET" {
                        method = "POST".into();
                    }
                    // Try JSON parse
                    if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(data) {
                        body = Some(serde_json::json!({
                            "type": "json",
                            "content": json_val
                        }));
                    } else {
                        body = Some(serde_json::json!({
                            "type": "text",
                            "content": data,
                            "content_type": "text/plain"
                        }));
                    }
                }
            }
            s if !s.starts_with('-') && url.is_empty() => {
                url = s.to_string();
            }
            _ => {
                // Skip unknown flags
            }
        }
        i += 1;
    }

    if url.is_empty() {
        return Err("No URL found in curl command".into());
    }

    let request_name = format!("{} {}", method, &url);

    let headers_val = if headers.is_empty() {
        None
    } else {
        Some(serde_json::Value::Array(headers))
    };

    let request = ApiRequest {
        id: Uuid::new_v4().to_string(),
        collection_id: collection_id.clone(),
        folder_id: None,
        name: request_name,
        method,
        url,
        params: None,
        headers: headers_val,
        body,
        auth: None,
        pre_request_script: None,
        test_script: None,
        variables: None,
        description: None,
        sort_order: 0,
        created_at: now.clone(),
        updated_at: now.clone(),
    };

    let collection = Collection {
        id: collection_id,
        name: "Imported from cURL".into(),
        description: None,
        auth: None,
        headers: None,
        variables: None,
        pre_request_script: None,
        test_script: None,
        sort_order: 0,
        created_at: now.clone(),
        updated_at: now,
    };

    Ok(ImportResult {
        collection,
        folders: vec![],
        requests: vec![request],
    })
}

/// Minimal shell-like tokenizer that handles single and double quotes.
fn shell_tokenize(input: &str) -> Result<Vec<String>, String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut chars = input.chars().peekable();
    let mut in_single = false;
    let mut in_double = false;

    while let Some(c) = chars.next() {
        match c {
            '\'' if !in_double => {
                in_single = !in_single;
            }
            '"' if !in_single => {
                in_double = !in_double;
            }
            ' ' | '\t' | '\n' if !in_single && !in_double => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            '\\' if !in_single => {
                if let Some(next) = chars.next() {
                    current.push(next);
                }
            }
            _ => {
                current.push(c);
            }
        }
    }

    if in_single || in_double {
        return Err("Unterminated quote in input".into());
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    Ok(tokens)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_import_simple_get() {
        let result = import_curl("curl https://api.example.com/users").unwrap();
        assert_eq!(result.requests.len(), 1);
        assert_eq!(result.requests[0].method, "GET");
        assert_eq!(result.requests[0].url, "https://api.example.com/users");
    }

    #[test]
    fn test_import_post_with_data() {
        let result = import_curl(
            r#"curl -X POST https://api.example.com/users -H 'Content-Type: application/json' -d '{"name":"test"}'"#,
        )
        .unwrap();
        assert_eq!(result.requests[0].method, "POST");
        assert!(result.requests[0].headers.is_some());
        assert!(result.requests[0].body.is_some());
    }

    #[test]
    fn test_import_multiline() {
        let input = "curl -X GET \\\n  https://api.example.com/items \\\n  -H 'Accept: application/json'";
        let result = import_curl(input).unwrap();
        assert_eq!(result.requests[0].method, "GET");
        assert_eq!(result.requests[0].url, "https://api.example.com/items");
    }
}
