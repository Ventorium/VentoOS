//! Query result export (CSV / JSON).
//!
//! Converts `QueryResult` into downloadable bytes without loading the entire
//! output into memory at once when the caller can consume an async stream.

use crate::types::{ExportFormat, QueryResult};

/// Export a `QueryResult` as CSV bytes.
pub fn export_csv(result: &QueryResult) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(4096);

    // Header row
    for (i, col) in result.columns.iter().enumerate() {
        if i > 0 {
            out.push(b',');
        }
        write_csv_field(&mut out, col);
    }
    out.push(b'\n');

    // Data rows
    for row in &result.rows {
        for (i, cell) in row.iter().enumerate() {
            if i > 0 {
                out.push(b',');
            }
            let text = json_value_to_csv_string(cell);
            write_csv_field(&mut out, &text);
        }
        out.push(b'\n');
    }

    Ok(out)
}

/// Export a `QueryResult` as JSON bytes.
///
/// `format` controls the shape:
/// - `ExportFormat::JsonArray` → `[ { col: val, ... }, ... ]`
/// - `ExportFormat::JsonLines` → one JSON object per line
/// - Other formats fall through to array.
pub fn export_json(result: &QueryResult, format: &ExportFormat) -> Result<Vec<u8>, String> {
    if let ExportFormat::JsonLines = format {
        let mut out = Vec::with_capacity(4096);
        for row in &result.rows {
            let obj = row_to_json_object(&result.columns, row);
            let line =
                serde_json::to_string(&obj).map_err(|e| format!("JSON serialize: {e}"))?;
            out.extend_from_slice(line.as_bytes());
            out.push(b'\n');
        }
        Ok(out)
    } else {
        // JSON array of objects
        let objects: Vec<serde_json::Value> = result
            .rows
            .iter()
            .map(|row| row_to_json_object(&result.columns, row))
            .collect();
        serde_json::to_vec_pretty(&objects).map_err(|e| format!("JSON serialize: {e}"))
    }
}

/// Dispatch export based on format.
pub fn export(result: &QueryResult, format: &ExportFormat) -> Result<Vec<u8>, String> {
    match format {
        ExportFormat::Csv => export_csv(result),
        ExportFormat::JsonArray | ExportFormat::JsonLines => export_json(result, format),
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────

fn row_to_json_object(
    columns: &[String],
    row: &[serde_json::Value],
) -> serde_json::Value {
    let mut map = serde_json::Map::with_capacity(columns.len());
    for (i, col) in columns.iter().enumerate() {
        let val = row.get(i).cloned().unwrap_or(serde_json::Value::Null);
        map.insert(col.clone(), val);
    }
    serde_json::Value::Object(map)
}

fn json_value_to_csv_string(val: &serde_json::Value) -> String {
    match val {
        serde_json::Value::Null => String::new(),
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Number(n) => n.to_string(),
        other => other.to_string(),
    }
}

/// Write a single CSV field, quoting if necessary (RFC 4180).
fn write_csv_field(out: &mut Vec<u8>, value: &str) {
    let needs_quoting = value.contains(',') || value.contains('"') || value.contains('\n');
    if needs_quoting {
        out.push(b'"');
        for b in value.as_bytes() {
            if *b == b'"' {
                out.push(b'"');
            }
            out.push(*b);
        }
        out.push(b'"');
    } else {
        out.extend_from_slice(value.as_bytes());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample_result() -> QueryResult {
        QueryResult {
            columns: vec!["id".into(), "name".into(), "active".into()],
            rows: vec![
                vec![json!(1), json!("Alice"), json!(true)],
                vec![json!(2), json!("Bob, Jr."), json!(false)],
                vec![json!(3), serde_json::Value::Null, json!(true)],
            ],
            row_count: 3,
            affected_rows: None,
            execution_time_ms: 10,
        }
    }

    #[test]
    fn test_csv_export() {
        let result = sample_result();
        let csv = export_csv(&result).unwrap();
        let text = String::from_utf8(csv).unwrap();
        assert!(text.starts_with("id,name,active\n"));
        // Bob, Jr. should be quoted
        assert!(text.contains("\"Bob, Jr.\""));
    }

    #[test]
    fn test_json_array_export() {
        let result = sample_result();
        let json_bytes = export_json(&result, &ExportFormat::JsonArray).unwrap();
        let parsed: Vec<serde_json::Value> = serde_json::from_slice(&json_bytes).unwrap();
        assert_eq!(parsed.len(), 3);
        assert_eq!(parsed[0]["name"], json!("Alice"));
    }

    #[test]
    fn test_json_lines_export() {
        let result = sample_result();
        let bytes = export_json(&result, &ExportFormat::JsonLines).unwrap();
        let text = String::from_utf8(bytes).unwrap();
        let lines: Vec<&str> = text.trim().split('\n').collect();
        assert_eq!(lines.len(), 3);
    }
}
