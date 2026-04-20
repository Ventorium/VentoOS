use serde_json::Value;
use uuid::Uuid;

use crate::models::{ApiRequest, Collection, Folder, ImportResult};

/// Import a Postman v2.1 collection JSON.
pub fn import_postman(data: &Value) -> Result<ImportResult, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let collection_id = Uuid::new_v4().to_string();

    let info = data
        .get("info")
        .ok_or_else(|| "Missing 'info' field – not a valid Postman collection".to_string())?;

    let name = info
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Imported Postman Collection")
        .to_string();
    let description = info
        .get("description")
        .and_then(|v| v.as_str())
        .map(String::from);

    let mut folders = Vec::new();
    let mut requests = Vec::new();
    let mut order = 0i32;

    if let Some(items) = data.get("item").and_then(|v| v.as_array()) {
        parse_items(
            items,
            &collection_id,
            None,
            &mut folders,
            &mut requests,
            &mut order,
            &now,
        );
    }

    let collection = Collection {
        id: collection_id,
        name,
        description,
        auth: data.get("auth").cloned(),
        headers: None,
        variables: data.get("variable").cloned(),
        pre_request_script: None,
        test_script: None,
        sort_order: 0,
        created_at: now.clone(),
        updated_at: now,
    };

    Ok(ImportResult {
        collection,
        folders,
        requests,
    })
}

fn parse_items(
    items: &[Value],
    collection_id: &str,
    parent_folder_id: Option<&str>,
    folders: &mut Vec<Folder>,
    requests: &mut Vec<ApiRequest>,
    order: &mut i32,
    now: &str,
) {
    for item in items {
        // If item has sub-items, it's a folder
        if item.get("item").is_some() {
            let folder_id = Uuid::new_v4().to_string();
            let folder_name = item
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Folder")
                .to_string();

            folders.push(Folder {
                id: folder_id.clone(),
                collection_id: collection_id.to_string(),
                parent_folder_id: parent_folder_id.map(String::from),
                name: folder_name,
                description: item
                    .get("description")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                auth: item.get("auth").cloned(),
                headers: None,
                variables: None,
                pre_request_script: None,
                test_script: None,
                sort_order: *order,
            });
            *order += 1;

            if let Some(sub_items) = item.get("item").and_then(|v| v.as_array()) {
                parse_items(
                    sub_items,
                    collection_id,
                    Some(&folder_id),
                    folders,
                    requests,
                    order,
                    now,
                );
            }
        } else if let Some(request) = item.get("request") {
            // It's a request
            let name = item
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Request")
                .to_string();

            let method = request
                .get("method")
                .and_then(|v| v.as_str())
                .unwrap_or("GET")
                .to_uppercase();

            let url = extract_url(request);

            let headers = request.get("header").and_then(|h| {
                let arr = h.as_array()?;
                let kvs: Vec<Value> = arr
                    .iter()
                    .map(|hdr| {
                        serde_json::json!({
                            "key": hdr.get("key").and_then(|v| v.as_str()).unwrap_or(""),
                            "value": hdr.get("value").and_then(|v| v.as_str()).unwrap_or(""),
                            "enabled": !hdr.get("disabled").and_then(serde_json::Value::as_bool).unwrap_or(false)
                        })
                    })
                    .collect();
                Some(Value::Array(kvs))
            });

            let body = extract_body(request);

            requests.push(ApiRequest {
                id: Uuid::new_v4().to_string(),
                collection_id: collection_id.to_string(),
                folder_id: parent_folder_id.map(String::from),
                name,
                method,
                url,
                params: None,
                headers,
                body,
                auth: request.get("auth").cloned(),
                pre_request_script: None,
                test_script: None,
                variables: None,
                description: request
                    .get("description")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                sort_order: *order,
                created_at: now.to_string(),
                updated_at: now.to_string(),
            });
            *order += 1;
        }
    }
}

fn extract_url(request: &Value) -> String {
    match request.get("url") {
        Some(Value::String(s)) => s.clone(),
        Some(obj) => obj
            .get("raw")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        None => String::new(),
    }
}

fn extract_body(request: &Value) -> Option<Value> {
    let body = request.get("body")?;
    let mode = body.get("mode").and_then(|v| v.as_str())?;

    match mode {
        "raw" => {
            let raw = body.get("raw").and_then(|v| v.as_str()).unwrap_or("");
            // Try to detect JSON
            if let Ok(json_val) = serde_json::from_str::<Value>(raw) {
                Some(serde_json::json!({
                    "type": "json",
                    "content": json_val
                }))
            } else {
                Some(serde_json::json!({
                    "type": "text",
                    "content": raw,
                    "content_type": "text/plain"
                }))
            }
        }
        "urlencoded" => {
            let params = body.get("urlencoded").and_then(|v| v.as_array())?;
            let kvs: Vec<Value> = params
                .iter()
                .map(|p| {
                    serde_json::json!({
                        "key": p.get("key").and_then(|v| v.as_str()).unwrap_or(""),
                        "value": p.get("value").and_then(|v| v.as_str()).unwrap_or(""),
                        "enabled": !p.get("disabled").and_then(serde_json::Value::as_bool).unwrap_or(false)
                    })
                })
                .collect();
            Some(serde_json::json!({
                "type": "form-urlencoded",
                "params": kvs
            }))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_import_postman() {
        let data = serde_json::json!({
            "info": {
                "name": "My Collection",
                "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
            },
            "item": [
                {
                    "name": "Auth",
                    "item": [
                        {
                            "name": "Login",
                            "request": {
                                "method": "POST",
                                "url": "https://api.example.com/login",
                                "body": {
                                    "mode": "raw",
                                    "raw": "{\"username\":\"test\"}"
                                }
                            }
                        }
                    ]
                },
                {
                    "name": "Get Status",
                    "request": {
                        "method": "GET",
                        "url": "https://api.example.com/status"
                    }
                }
            ]
        });

        let result = import_postman(&data).unwrap();
        assert_eq!(result.collection.name, "My Collection");
        assert_eq!(result.folders.len(), 1);
        assert_eq!(result.requests.len(), 2);
    }
}
