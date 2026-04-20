#![allow(clippy::too_many_lines, clippy::cast_possible_truncation, clippy::cast_possible_wrap)]

use serde_json::Value;
use uuid::Uuid;

use crate::models::{ApiRequest, Collection, Folder, ImportResult};

/// Parse an `OpenAPI` 3.x or Swagger 2.x JSON spec and convert it into a
/// [`Collection`] with [`Folder`]s and [`ApiRequest`]s.
pub fn import_openapi(spec: &Value) -> Result<ImportResult, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let collection_id = Uuid::new_v4().to_string();

    // Detect version
    let is_swagger2 = spec.get("swagger").is_some();
    let is_openapi3 = spec.get("openapi").is_some();
    if !is_swagger2 && !is_openapi3 {
        return Err("Not a valid OpenAPI/Swagger spec (missing 'openapi' or 'swagger' key)".into());
    }

    // Collection info
    let default_info = Value::Object(serde_json::Map::default());
    let info = spec.get("info").unwrap_or(&default_info);
    let name = info
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Imported API")
        .to_string();
    let description = info.get("description").and_then(|v| v.as_str()).map(String::from);

    // Base URL
    let base_url = extract_base_url(spec, is_swagger2);

    // Tags → folders
    let mut folders: Vec<Folder> = Vec::new();
    let mut tag_folder_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();

    if let Some(tags) = spec.get("tags").and_then(|v| v.as_array()) {
        for (i, tag) in tags.iter().enumerate() {
            let tag_name = tag.get("name").and_then(|v| v.as_str()).unwrap_or("default");
            let folder_id = Uuid::new_v4().to_string();
            folders.push(Folder {
                id: folder_id.clone(),
                collection_id: collection_id.clone(),
                parent_folder_id: None,
                name: tag_name.to_string(),
                description: tag.get("description").and_then(|v| v.as_str()).map(String::from),
                auth: None,
                headers: None,
                variables: None,
                pre_request_script: None,
                test_script: None,
                sort_order: i as i32,
            });
            tag_folder_map.insert(tag_name.to_string(), folder_id);
        }
    }

    // Paths → requests
    let mut requests: Vec<ApiRequest> = Vec::new();
    let paths = spec.get("paths").and_then(|v| v.as_object());

    if let Some(paths) = paths {
        let mut order = 0i32;
        for (path, methods) in paths {
            let Some(methods_obj) = methods.as_object() else {
                continue;
            };
            for (method, operation) in methods_obj {
                // Skip non-HTTP-method keys like "parameters"
                if !matches!(
                    method.as_str(),
                    "get" | "post" | "put" | "delete" | "patch" | "head" | "options"
                ) {
                    continue;
                }

                let op_id = operation
                    .get("operationId")
                    .and_then(|v| v.as_str())
                    .unwrap_or(path.as_str());
                let summary = operation
                    .get("summary")
                    .and_then(|v| v.as_str())
                    .unwrap_or(op_id);

                // Determine folder from first tag
                let folder_id = operation
                    .get("tags")
                    .and_then(|v| v.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|v| v.as_str())
                    .and_then(|tag| {
                        // Create folder on-the-fly if not seen via tags array
                        if !tag_folder_map.contains_key(tag) {
                            let fid = Uuid::new_v4().to_string();
                            folders.push(Folder {
                                id: fid.clone(),
                                collection_id: collection_id.clone(),
                                parent_folder_id: None,
                                name: tag.to_string(),
                                description: None,
                                auth: None,
                                headers: None,
                                variables: None,
                                pre_request_script: None,
                                test_script: None,
                                sort_order: folders.len() as i32,
                            });
                            tag_folder_map.insert(tag.to_string(), fid);
                        }
                        tag_folder_map.get(tag).cloned()
                    });

                let url = format!("{base_url}{path}");

                // Build example body from requestBody (OpenAPI 3.x)
                let body = extract_request_body(spec, operation);

                // Build query params from parameters
                let params = extract_query_params(operation);

                requests.push(ApiRequest {
                    id: Uuid::new_v4().to_string(),
                    collection_id: collection_id.clone(),
                    folder_id,
                    name: summary.to_string(),
                    method: method.to_uppercase(),
                    url,
                    params,
                    headers: None,
                    body,
                    auth: None,
                    pre_request_script: None,
                    test_script: None,
                    variables: None,
                    description: operation
                        .get("description")
                        .and_then(|v| v.as_str())
                        .map(String::from),
                    sort_order: order,
                    created_at: now.clone(),
                    updated_at: now.clone(),
                });
                order += 1;
            }
        }
    }

    let collection = Collection {
        id: collection_id,
        name,
        description,
        auth: None,
        headers: None,
        variables: Some(base_url_variable(&base_url)),
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

fn extract_base_url(spec: &Value, is_swagger2: bool) -> String {
    if is_swagger2 {
        let host = spec.get("host").and_then(|v| v.as_str()).unwrap_or("localhost");
        let base_path = spec.get("basePath").and_then(|v| v.as_str()).unwrap_or("");
        let scheme = spec
            .get("schemes")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .and_then(|v| v.as_str())
            .unwrap_or("https");
        format!("{scheme}://{host}{base_path}")
    } else {
        spec.get("servers")
            .and_then(|v| v.as_array())
            .and_then(|arr| arr.first())
            .and_then(|s| s.get("url"))
            .and_then(|v| v.as_str())
            .unwrap_or("https://localhost")
            .to_string()
    }
}

fn base_url_variable(base_url: &str) -> serde_json::Value {
    serde_json::json!([{
        "key": "baseUrl",
        "value": base_url,
        "enabled": true
    }])
}

fn extract_request_body(spec: &Value, operation: &Value) -> Option<serde_json::Value> {
    // OpenAPI 3.x
    if let Some(rb) = operation.get("requestBody") {
        let content = rb.get("content")?;
        if let Some(json_ct) = content.get("application/json")
            && let Some(schema) = json_ct.get("schema") {
                let example = schema_to_example(spec, schema);
                if !example.is_null() {
                    return Some(serde_json::json!({
                        "type": "json",
                        "content": example
                    }));
                }
            }
    }
    None
}

fn extract_query_params(operation: &Value) -> Option<serde_json::Value> {
    let params = operation.get("parameters")?.as_array()?;
    let query_params: Vec<serde_json::Value> = params
        .iter()
        .filter(|p| p.get("in").and_then(|v| v.as_str()) == Some("query"))
        .map(|p| {
            serde_json::json!({
                "key": p.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                "value": "",
                "enabled": p.get("required").and_then(serde_json::Value::as_bool).unwrap_or(false),
                "description": p.get("description").and_then(|v| v.as_str()).unwrap_or("")
            })
        })
        .collect();

    if query_params.is_empty() {
        None
    } else {
        Some(serde_json::Value::Array(query_params))
    }
}

fn schema_to_example(spec: &Value, schema: &Value) -> Value {
    // Handle $ref
    if let Some(ref_path) = schema.get("$ref").and_then(|v| v.as_str()) {
        if let Some(resolved) = resolve_ref(spec, ref_path) {
            return schema_to_example(spec, resolved);
        }
        return Value::Null;
    }

    // Handle example
    if let Some(example) = schema.get("example") {
        return example.clone();
    }

    match schema.get("type").and_then(|v| v.as_str()) {
        Some("object") => {
            let mut obj = serde_json::Map::new();
            if let Some(props) = schema.get("properties").and_then(|v| v.as_object()) {
                for (key, prop_schema) in props {
                    obj.insert(key.clone(), schema_to_example(spec, prop_schema));
                }
            }
            Value::Object(obj)
        }
        Some("array") => {
            let item = schema
                .get("items")
                .map_or(Value::Null, |s| schema_to_example(spec, s));
            Value::Array(vec![item])
        }
        Some("string") => Value::String("string".into()),
        Some("integer") => serde_json::json!(0),
        Some("number") => serde_json::json!(0.0),
        Some("boolean") => Value::Bool(true),
        _ => Value::Null,
    }
}

fn resolve_ref<'a>(spec: &'a Value, ref_path: &str) -> Option<&'a Value> {
    // e.g. "#/components/schemas/User" or "#/definitions/User"
    let path = ref_path.strip_prefix("#/")?;
    let mut current = spec;
    for segment in path.split('/') {
        current = current.get(segment)?;
    }
    Some(current)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_import_openapi3() {
        let spec = serde_json::json!({
            "openapi": "3.0.0",
            "info": { "title": "Test API", "version": "1.0" },
            "servers": [{ "url": "https://api.example.com" }],
            "paths": {
                "/users": {
                    "get": {
                        "summary": "List users",
                        "tags": ["Users"]
                    },
                    "post": {
                        "summary": "Create user",
                        "tags": ["Users"],
                        "requestBody": {
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "name": { "type": "string" },
                                            "age": { "type": "integer" }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        let result = import_openapi(&spec).unwrap();
        assert_eq!(result.collection.name, "Test API");
        assert_eq!(result.folders.len(), 1);
        assert_eq!(result.folders[0].name, "Users");
        assert_eq!(result.requests.len(), 2);
    }

    #[test]
    fn test_import_swagger2() {
        let spec = serde_json::json!({
            "swagger": "2.0",
            "info": { "title": "Legacy API", "version": "1.0" },
            "host": "api.legacy.com",
            "basePath": "/v1",
            "schemes": ["https"],
            "paths": {
                "/items": {
                    "get": {
                        "summary": "List items"
                    }
                }
            }
        });

        let result = import_openapi(&spec).unwrap();
        assert_eq!(result.collection.name, "Legacy API");
        assert_eq!(result.requests.len(), 1);
        assert!(result.requests[0].url.contains("api.legacy.com"));
    }
}
