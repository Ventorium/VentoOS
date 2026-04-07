//! Stream data type operations.
//!
//! Provides helpers for Redis Stream commands:
//! XRANGE, XREVRANGE, XADD, XLEN, XGROUP CREATE, XREADGROUP.

use crate::resp::RespValue;
use crate::types::StreamEntry;

/// Parse XRANGE/XREVRANGE response into stream entries.
pub fn parse_xrange_response(resp: RespValue) -> Result<Vec<StreamEntry>, String> {
    let arr = resp
        .into_array()
        .ok_or("Invalid stream response: expected array")?;

    let mut entries = Vec::new();
    for item in arr {
        let entry_arr = item.into_array().ok_or("Invalid stream entry")?;
        if entry_arr.len() < 2 {
            continue;
        }

        let id = entry_arr[0].as_str().unwrap_or("").to_string();
        let fields_arr = entry_arr[1].clone().into_array().unwrap_or_default();

        let mut fields_map = serde_json::Map::new();
        let mut i = 0;
        while i + 1 < fields_arr.len() {
            let key = fields_arr[i].as_str().unwrap_or("").to_string();
            let value = fields_arr[i + 1].to_string_lossy();
            fields_map.insert(key, serde_json::Value::String(value));
            i += 2;
        }

        entries.push(StreamEntry {
            id,
            fields: serde_json::Value::Object(fields_map),
        });
    }

    Ok(entries)
}

/// Build XADD command arguments from field key-value pairs.
pub fn build_xadd_args<'a>(
    key: &'a str,
    id: &'a str,
    fields: &'a [(String, String)],
) -> Vec<&'a str> {
    let mut args: Vec<&str> = vec!["XADD", key, id];
    for (k, v) in fields {
        args.push(k);
        args.push(v);
    }
    args
}
