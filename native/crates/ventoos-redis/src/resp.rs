//! RESP (Redis Serialization Protocol) parser and builder.
//!
//! Supports all RESP2 types and basic RESP3 types with streaming reads.

use std::future::Future;
use std::pin::Pin;

use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncReadExt};

/// Maximum allowed bulk string / verbatim string size (512 MB).
const MAX_BULK_SIZE: i64 = 512 * 1024 * 1024;

/// Maximum collection element count.
const MAX_COLLECTION_LEN: i64 = 10_000_000;

// ── RespValue ───────────────────────────────────────────────

/// Parsed RESP value covering all RESP2 and RESP3 wire types.
#[derive(Debug, Clone, PartialEq)]
pub enum RespValue {
    // RESP2
    /// Simple string (`+`).
    SimpleString(String),
    /// Error (`-`).
    Error(String),
    /// Integer (`:`).
    Integer(i64),
    /// Bulk string (`$`). `None` = null bulk string (`$-1`).
    BulkString(Option<Vec<u8>>),
    /// Array (`*`). `None` = null array (`*-1`).
    Array(Option<Vec<RespValue>>),

    // RESP3
    /// Null (`_`).
    Null,
    /// Boolean (`#`).
    Boolean(bool),
    /// Double (`,`).
    Double(f64),
    /// Big number (`(`).
    BigNumber(String),
    /// Verbatim string (`=`).
    VerbatimString { encoding: String, data: String },
    /// Map (`%`).
    Map(Vec<(RespValue, RespValue)>),
    /// Set (`~`).
    Set(Vec<RespValue>),
    /// Push message (`>`). Used by RESP3 for server-initiated messages.
    Push(Vec<RespValue>),
}

impl RespValue {
    /// Interpret as a UTF-8 string reference.
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Self::SimpleString(s) | Self::Error(s) => Some(s),
            Self::BulkString(Some(bytes)) => std::str::from_utf8(bytes).ok(),
            Self::VerbatimString { data, .. } => Some(data),
            _ => None,
        }
    }

    /// Raw byte slice for bulk strings.
    pub fn as_bytes_ref(&self) -> Option<&[u8]> {
        match self {
            Self::BulkString(Some(b)) => Some(b),
            _ => None,
        }
    }

    /// Interpret as `i64` (works for Integer, numeric `BulkString`, numeric `SimpleString`).
    pub fn as_i64(&self) -> Option<i64> {
        match self {
            Self::Integer(n) => Some(*n),
            Self::BulkString(Some(bytes)) => std::str::from_utf8(bytes).ok()?.parse().ok(),
            Self::SimpleString(s) => s.parse().ok(),
            _ => None,
        }
    }

    /// True for any null representation.
    pub fn is_null(&self) -> bool {
        matches!(
            self,
            Self::Null | Self::BulkString(None) | Self::Array(None)
        )
    }

    /// True if this is a RESP error.
    pub fn is_error(&self) -> bool {
        matches!(self, Self::Error(_))
    }

    /// True if this is a `+OK` simple string.
    pub fn is_ok(&self) -> bool {
        matches!(self, Self::SimpleString(s) if s == "OK")
    }

    /// Error message text (if error).
    pub fn error_message(&self) -> Option<&str> {
        match self {
            Self::Error(s) => Some(s),
            _ => None,
        }
    }

    /// Consume and return inner array / set / push elements.
    pub fn into_array(self) -> Option<Vec<RespValue>> {
        match self {
            Self::Array(Some(arr)) | Self::Set(arr) | Self::Push(arr) => Some(arr),
            _ => None,
        }
    }

    /// Lossy string for display / logging.
    pub fn to_string_lossy(&self) -> String {
        match self {
            Self::SimpleString(s) | Self::Error(s) | Self::BigNumber(s) => s.clone(),
            Self::Integer(n) => n.to_string(),
            Self::BulkString(Some(bytes)) => String::from_utf8_lossy(bytes).into_owned(),
            Self::BulkString(None) | Self::Null | Self::Array(None) => "(nil)".into(),
            Self::Boolean(b) => b.to_string(),
            Self::Double(f) => f.to_string(),
            Self::VerbatimString { data, .. } => data.clone(),
            Self::Array(Some(arr)) | Self::Set(arr) | Self::Push(arr) => {
                let items: Vec<String> = arr.iter().map(Self::to_string_lossy).collect();
                format!("[{}]", items.join(", "))
            }
            Self::Map(pairs) => {
                let items: Vec<String> = pairs
                    .iter()
                    .map(|(k, v)| format!("{}: {}", k.to_string_lossy(), v.to_string_lossy()))
                    .collect();
                format!("{{{}}}", items.join(", "))
            }
        }
    }

    /// Convert to `serde_json::Value` for JSON API serialization.
    pub fn to_json(&self) -> serde_json::Value {
        match self {
            Self::SimpleString(s) => serde_json::Value::String(s.clone()),
            Self::Error(s) => serde_json::json!({ "error": s }),
            Self::Integer(n) => serde_json::Value::Number((*n).into()),
            Self::BulkString(Some(bytes)) => {
                serde_json::Value::String(String::from_utf8_lossy(bytes).into_owned())
            }
            Self::BulkString(None) | Self::Null | Self::Array(None) => serde_json::Value::Null,
            Self::Boolean(b) => serde_json::Value::Bool(*b),
            Self::Double(f) => serde_json::Number::from_f64(*f)
                .map_or(serde_json::Value::Null, serde_json::Value::Number),
            Self::BigNumber(s) | Self::VerbatimString { data: s, .. } => {
                serde_json::Value::String(s.clone())
            }
            Self::Array(Some(arr)) | Self::Set(arr) | Self::Push(arr) => {
                serde_json::Value::Array(arr.iter().map(Self::to_json).collect())
            }
            Self::Map(pairs) => {
                let map: serde_json::Map<String, serde_json::Value> = pairs
                    .iter()
                    .map(|(k, v)| (k.to_string_lossy(), v.to_json()))
                    .collect();
                serde_json::Value::Object(map)
            }
        }
    }
}

// ── Parser ──────────────────────────────────────────────────

/// Read one complete RESP value from `reader`.
///
/// The reader must implement `AsyncBufRead` (e.g. `BufReader<TcpStream>`).
/// Handles RESP2 types (`+`, `-`, `:`, `$`, `*`) and RESP3 types
/// (`_`, `#`, `,`, `(`, `=`, `%`, `~`, `>`).
///
/// Returns a boxed future to support recursive async parsing (arrays, maps, etc.).
pub fn parse_resp<'a, R: AsyncBufRead + Unpin + Send + 'a>(
    reader: &'a mut R,
) -> Pin<Box<dyn Future<Output = Result<RespValue, String>> + Send + 'a>> {
    Box::pin(async move {
        let mut line = String::new();
        let n = reader
            .read_line(&mut line)
            .await
            .map_err(|e| format!("Read error: {e}"))?;
        if n == 0 {
            return Err("Connection closed".into());
        }

        let line = line.trim_end_matches('\n').trim_end_matches('\r');
        if line.is_empty() {
            return Err("Empty RESP line".into());
        }

        let type_byte = line.as_bytes()[0];
        let payload = line[1..].to_string();

        match type_byte {
            b'+' => Ok(RespValue::SimpleString(payload)),
            b'-' => Ok(RespValue::Error(payload)),
            b':' => {
                let n = payload
                    .parse::<i64>()
                    .map_err(|e| format!("Invalid integer: {e}"))?;
                Ok(RespValue::Integer(n))
            }
            b'$' => parse_bulk_string(reader, &payload).await,
            b'*' => parse_array(reader, &payload).await,
            // RESP3
            b'_' => Ok(RespValue::Null),
            b'#' => Ok(RespValue::Boolean(payload == "t")),
            b',' => {
                if payload == "inf" {
                    Ok(RespValue::Double(f64::INFINITY))
                } else if payload == "-inf" {
                    Ok(RespValue::Double(f64::NEG_INFINITY))
                } else {
                    let f = payload
                        .parse::<f64>()
                        .map_err(|e| format!("Invalid double: {e}"))?;
                    Ok(RespValue::Double(f))
                }
            }
            b'(' => Ok(RespValue::BigNumber(payload)),
            b'=' => parse_verbatim_string(reader, &payload).await,
            b'%' => parse_map(reader, &payload).await,
            b'~' => parse_collection(reader, &payload, true).await,
            b'>' => parse_collection(reader, &payload, false).await,
            _ => Err(format!("Unknown RESP type byte: {}", type_byte as char)),
        }
    })
}

async fn parse_bulk_string<R: AsyncBufRead + Unpin>(
    reader: &mut R,
    length_str: &str,
) -> Result<RespValue, String> {
    let len = length_str
        .parse::<i64>()
        .map_err(|e| format!("Invalid bulk string length: {e}"))?;
    if len < 0 {
        return Ok(RespValue::BulkString(None));
    }
    if len > MAX_BULK_SIZE {
        return Err(format!("Bulk string too large: {len} bytes"));
    }
    #[allow(clippy::cast_sign_loss, clippy::cast_possible_truncation)]
    let len = len as usize;
    let mut buf = vec![0u8; len];
    reader
        .read_exact(&mut buf)
        .await
        .map_err(|e| format!("Read error: {e}"))?;
    // Consume trailing \r\n
    let mut crlf = [0u8; 2];
    reader
        .read_exact(&mut crlf)
        .await
        .map_err(|e| format!("Read error: {e}"))?;
    Ok(RespValue::BulkString(Some(buf)))
}

async fn parse_array<R: AsyncBufRead + Unpin + Send>(
    reader: &mut R,
    count_str: &str,
) -> Result<RespValue, String> {
    let count = count_str
        .parse::<i64>()
        .map_err(|e| format!("Invalid array length: {e}"))?;
    if count < 0 {
        return Ok(RespValue::Array(None));
    }
    if count > MAX_COLLECTION_LEN {
        return Err(format!("Array too large: {count} elements"));
    }
    let mut elements = Vec::with_capacity(usize::try_from(count).unwrap_or(0));
    for _ in 0..count {
        elements.push(parse_resp(reader).await?);
    }
    Ok(RespValue::Array(Some(elements)))
}

async fn parse_verbatim_string<R: AsyncBufRead + Unpin>(
    reader: &mut R,
    length_str: &str,
) -> Result<RespValue, String> {
    let len = length_str
        .parse::<i64>()
        .map_err(|e| format!("Invalid verbatim string length: {e}"))?;
    if len < 0 {
        return Ok(RespValue::Null);
    }
    if len > MAX_BULK_SIZE {
        return Err(format!("Verbatim string too large: {len} bytes"));
    }
    let len = usize::try_from(len).unwrap_or(0);
    let mut buf = vec![0u8; len];
    reader
        .read_exact(&mut buf)
        .await
        .map_err(|e| format!("Read error: {e}"))?;
    // Consume trailing \r\n
    let mut crlf = [0u8; 2];
    reader
        .read_exact(&mut crlf)
        .await
        .map_err(|e| format!("Read error: {e}"))?;

    let s = String::from_utf8_lossy(&buf).into_owned();
    // Format: "enc:data" where enc is 3 bytes
    if s.len() >= 4 && s.as_bytes()[3] == b':' {
        Ok(RespValue::VerbatimString {
            encoding: s[..3].to_string(),
            data: s[4..].to_string(),
        })
    } else {
        Ok(RespValue::VerbatimString {
            encoding: "txt".to_string(),
            data: s,
        })
    }
}

async fn parse_map<R: AsyncBufRead + Unpin + Send>(
    reader: &mut R,
    count_str: &str,
) -> Result<RespValue, String> {
    let count = count_str
        .parse::<i64>()
        .map_err(|e| format!("Invalid map length: {e}"))?;
    if count < 0 {
        return Ok(RespValue::Map(vec![]));
    }
    if count > MAX_COLLECTION_LEN {
        return Err(format!("Map too large: {count} entries"));
    }
    let mut pairs = Vec::with_capacity(usize::try_from(count).unwrap_or(0));
    for _ in 0..count {
        let key = parse_resp(reader).await?;
        let value = parse_resp(reader).await?;
        pairs.push((key, value));
    }
    Ok(RespValue::Map(pairs))
}

/// Parse `~` (Set) or `>` (Push) — same wire format as array.
async fn parse_collection<R: AsyncBufRead + Unpin + Send>(
    reader: &mut R,
    count_str: &str,
    is_set: bool,
) -> Result<RespValue, String> {
    let count = count_str
        .parse::<i64>()
        .map_err(|e| format!("Invalid collection length: {e}"))?;
    if count < 0 {
        return if is_set {
            Ok(RespValue::Set(vec![]))
        } else {
            Ok(RespValue::Push(vec![]))
        };
    }
    if count > MAX_COLLECTION_LEN {
        return Err(format!("Collection too large: {count} elements"));
    }
    let mut elements = Vec::with_capacity(usize::try_from(count).unwrap_or(0));
    for _ in 0..count {
        elements.push(parse_resp(reader).await?);
    }
    if is_set {
        Ok(RespValue::Set(elements))
    } else {
        Ok(RespValue::Push(elements))
    }
}

// ── Command builder ─────────────────────────────────────────

/// Build a RESP array command from argument strings.
///
/// ```text
/// build_command(&["SET", "key", "value"])
/// → *3\r\n$3\r\nSET\r\n$3\r\nkey\r\n$5\r\nvalue\r\n
/// ```
pub fn build_command(args: &[&str]) -> Vec<u8> {
    use std::fmt::Write;
    let mut cmd = format!("*{}\r\n", args.len());
    for arg in args {
        write!(cmd, "${}\r\n{}\r\n", arg.len(), arg).unwrap();
    }
    cmd.into_bytes()
}

// ── Tests ───────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::BufReader;

    /// Helper: parse RESP bytes into a `RespValue`.
    async fn parse(input: &[u8]) -> Result<RespValue, String> {
        let mut reader = BufReader::new(input);
        parse_resp(&mut reader).await
    }

    // ── RESP2 types ──

    #[tokio::test]
    async fn simple_string() {
        assert_eq!(
            parse(b"+OK\r\n").await.unwrap(),
            RespValue::SimpleString("OK".into())
        );
    }

    #[tokio::test]
    async fn simple_string_with_spaces() {
        assert_eq!(
            parse(b"+hello world\r\n").await.unwrap(),
            RespValue::SimpleString("hello world".into())
        );
    }

    #[tokio::test]
    async fn error() {
        assert_eq!(
            parse(b"-ERR unknown command\r\n").await.unwrap(),
            RespValue::Error("ERR unknown command".into())
        );
    }

    #[tokio::test]
    async fn integer_positive() {
        assert_eq!(parse(b":1000\r\n").await.unwrap(), RespValue::Integer(1000));
    }

    #[tokio::test]
    async fn integer_negative() {
        assert_eq!(parse(b":-5\r\n").await.unwrap(), RespValue::Integer(-5));
    }

    #[tokio::test]
    async fn integer_zero() {
        assert_eq!(parse(b":0\r\n").await.unwrap(), RespValue::Integer(0));
    }

    #[tokio::test]
    async fn bulk_string() {
        assert_eq!(
            parse(b"$5\r\nhello\r\n").await.unwrap(),
            RespValue::BulkString(Some(b"hello".to_vec()))
        );
    }

    #[tokio::test]
    async fn bulk_string_empty() {
        assert_eq!(
            parse(b"$0\r\n\r\n").await.unwrap(),
            RespValue::BulkString(Some(vec![]))
        );
    }

    #[tokio::test]
    async fn bulk_string_null() {
        assert_eq!(
            parse(b"$-1\r\n").await.unwrap(),
            RespValue::BulkString(None)
        );
    }

    #[tokio::test]
    async fn bulk_string_with_crlf_inside() {
        // Bulk strings are binary-safe: "\r\n" inside the data
        let input = b"$7\r\nhe\r\nllo\r\n";
        assert_eq!(
            parse(input).await.unwrap(),
            RespValue::BulkString(Some(b"he\r\nllo".to_vec()))
        );
    }

    #[tokio::test]
    async fn array_simple() {
        let input = b"*3\r\n$3\r\nfoo\r\n$3\r\nbar\r\n:42\r\n";
        let expected = RespValue::Array(Some(vec![
            RespValue::BulkString(Some(b"foo".to_vec())),
            RespValue::BulkString(Some(b"bar".to_vec())),
            RespValue::Integer(42),
        ]));
        assert_eq!(parse(input).await.unwrap(), expected);
    }

    #[tokio::test]
    async fn array_empty() {
        assert_eq!(
            parse(b"*0\r\n").await.unwrap(),
            RespValue::Array(Some(vec![]))
        );
    }

    #[tokio::test]
    async fn array_null() {
        assert_eq!(parse(b"*-1\r\n").await.unwrap(), RespValue::Array(None));
    }

    #[tokio::test]
    async fn array_nested() {
        // *2\r\n *2\r\n :1\r\n :2\r\n *2\r\n :3\r\n :4\r\n
        let input = b"*2\r\n*2\r\n:1\r\n:2\r\n*2\r\n:3\r\n:4\r\n";
        let expected = RespValue::Array(Some(vec![
            RespValue::Array(Some(vec![RespValue::Integer(1), RespValue::Integer(2)])),
            RespValue::Array(Some(vec![RespValue::Integer(3), RespValue::Integer(4)])),
        ]));
        assert_eq!(parse(input).await.unwrap(), expected);
    }

    #[tokio::test]
    async fn array_with_null_element() {
        let input = b"*3\r\n$3\r\nabc\r\n$-1\r\n:7\r\n";
        let expected = RespValue::Array(Some(vec![
            RespValue::BulkString(Some(b"abc".to_vec())),
            RespValue::BulkString(None),
            RespValue::Integer(7),
        ]));
        assert_eq!(parse(input).await.unwrap(), expected);
    }

    #[tokio::test]
    async fn deeply_nested_array() {
        // [[["deep"]]]
        let input = b"*1\r\n*1\r\n*1\r\n$4\r\ndeep\r\n";
        let expected =
            RespValue::Array(Some(vec![RespValue::Array(Some(vec![RespValue::Array(
                Some(vec![RespValue::BulkString(Some(b"deep".to_vec()))]),
            )]))]));
        assert_eq!(parse(input).await.unwrap(), expected);
    }

    // ── RESP3 types ──

    #[tokio::test]
    async fn resp3_null() {
        assert_eq!(parse(b"_\r\n").await.unwrap(), RespValue::Null);
    }

    #[tokio::test]
    async fn resp3_boolean_true() {
        assert_eq!(parse(b"#t\r\n").await.unwrap(), RespValue::Boolean(true));
    }

    #[tokio::test]
    async fn resp3_boolean_false() {
        assert_eq!(parse(b"#f\r\n").await.unwrap(), RespValue::Boolean(false));
    }

    #[tokio::test]
    async fn resp3_double() {
        assert_eq!(parse(b",3.5\r\n").await.unwrap(), RespValue::Double(3.5));
    }

    #[tokio::test]
    async fn resp3_double_inf() {
        assert_eq!(
            parse(b",inf\r\n").await.unwrap(),
            RespValue::Double(f64::INFINITY)
        );
        assert_eq!(
            parse(b",-inf\r\n").await.unwrap(),
            RespValue::Double(f64::NEG_INFINITY)
        );
    }

    #[tokio::test]
    async fn resp3_big_number() {
        assert_eq!(
            parse(b"(3492890328409238509324850943850943825024385\r\n")
                .await
                .unwrap(),
            RespValue::BigNumber("3492890328409238509324850943850943825024385".into())
        );
    }

    #[tokio::test]
    async fn resp3_verbatim_string() {
        let input = b"=15\r\ntxt:Some string\r\n";
        assert_eq!(
            parse(input).await.unwrap(),
            RespValue::VerbatimString {
                encoding: "txt".into(),
                data: "Some string".into(),
            }
        );
    }

    #[tokio::test]
    async fn resp3_map() {
        // %2\r\n +key1\r\n :1\r\n +key2\r\n :2\r\n
        let input = b"%2\r\n+key1\r\n:1\r\n+key2\r\n:2\r\n";
        let expected = RespValue::Map(vec![
            (
                RespValue::SimpleString("key1".into()),
                RespValue::Integer(1),
            ),
            (
                RespValue::SimpleString("key2".into()),
                RespValue::Integer(2),
            ),
        ]);
        assert_eq!(parse(input).await.unwrap(), expected);
    }

    #[tokio::test]
    async fn resp3_set() {
        let input = b"~3\r\n+a\r\n+b\r\n+c\r\n";
        let expected = RespValue::Set(vec![
            RespValue::SimpleString("a".into()),
            RespValue::SimpleString("b".into()),
            RespValue::SimpleString("c".into()),
        ]);
        assert_eq!(parse(input).await.unwrap(), expected);
    }

    #[tokio::test]
    async fn resp3_push() {
        let input = b">3\r\n$7\r\nmessage\r\n$2\r\nch\r\n$4\r\ndata\r\n";
        let expected = RespValue::Push(vec![
            RespValue::BulkString(Some(b"message".to_vec())),
            RespValue::BulkString(Some(b"ch".to_vec())),
            RespValue::BulkString(Some(b"data".to_vec())),
        ]);
        assert_eq!(parse(input).await.unwrap(), expected);
    }

    // ── Command builder ──

    #[tokio::test]
    async fn build_command_ping() {
        let cmd = build_command(&["PING"]);
        assert_eq!(cmd, b"*1\r\n$4\r\nPING\r\n");
    }

    #[tokio::test]
    async fn build_command_set() {
        let cmd = build_command(&["SET", "mykey", "myvalue"]);
        assert_eq!(cmd, b"*3\r\n$3\r\nSET\r\n$5\r\nmykey\r\n$7\r\nmyvalue\r\n");
    }

    #[tokio::test]
    async fn build_command_empty_value() {
        let cmd = build_command(&["SET", "k", ""]);
        assert_eq!(cmd, b"*3\r\n$3\r\nSET\r\n$1\r\nk\r\n$0\r\n\r\n");
    }

    // ── RespValue helpers ──

    #[tokio::test]
    async fn as_str_simple_string() {
        let v = RespValue::SimpleString("OK".into());
        assert_eq!(v.as_str(), Some("OK"));
    }

    #[tokio::test]
    async fn as_str_bulk_string() {
        let v = RespValue::BulkString(Some(b"hello".to_vec()));
        assert_eq!(v.as_str(), Some("hello"));
    }

    #[tokio::test]
    async fn as_str_null() {
        let v = RespValue::BulkString(None);
        assert_eq!(v.as_str(), None);
    }

    #[tokio::test]
    async fn as_i64_integer() {
        assert_eq!(RespValue::Integer(42).as_i64(), Some(42));
    }

    #[tokio::test]
    async fn as_i64_bulk_string_numeric() {
        let v = RespValue::BulkString(Some(b"100".to_vec()));
        assert_eq!(v.as_i64(), Some(100));
    }

    #[tokio::test]
    async fn is_null_variants() {
        assert!(RespValue::Null.is_null());
        assert!(RespValue::BulkString(None).is_null());
        assert!(RespValue::Array(None).is_null());
        assert!(!RespValue::Integer(0).is_null());
    }

    #[tokio::test]
    async fn is_error_check() {
        assert!(RespValue::Error("ERR".into()).is_error());
        assert!(!RespValue::SimpleString("OK".into()).is_error());
    }

    #[tokio::test]
    async fn is_ok_check() {
        assert!(RespValue::SimpleString("OK".into()).is_ok());
        assert!(!RespValue::SimpleString("QUEUED".into()).is_ok());
    }

    #[tokio::test]
    async fn into_array_works() {
        let v = RespValue::Array(Some(vec![RespValue::Integer(1)]));
        let arr = v.into_array().unwrap();
        assert_eq!(arr.len(), 1);
    }

    #[tokio::test]
    async fn into_array_null() {
        assert!(RespValue::Array(None).into_array().is_none());
    }

    // ── to_json ──

    #[tokio::test]
    async fn to_json_simple_string() {
        let v = RespValue::SimpleString("OK".into());
        assert_eq!(v.to_json(), serde_json::json!("OK"));
    }

    #[tokio::test]
    async fn to_json_error() {
        let v = RespValue::Error("ERR bad".into());
        assert_eq!(v.to_json(), serde_json::json!({"error": "ERR bad"}));
    }

    #[tokio::test]
    async fn to_json_integer() {
        let v = RespValue::Integer(42);
        assert_eq!(v.to_json(), serde_json::json!(42));
    }

    #[tokio::test]
    async fn to_json_bulk_string() {
        let v = RespValue::BulkString(Some(b"hello".to_vec()));
        assert_eq!(v.to_json(), serde_json::json!("hello"));
    }

    #[tokio::test]
    async fn to_json_null_variants() {
        assert_eq!(
            RespValue::BulkString(None).to_json(),
            serde_json::Value::Null
        );
        assert_eq!(RespValue::Null.to_json(), serde_json::Value::Null);
        assert_eq!(RespValue::Array(None).to_json(), serde_json::Value::Null);
    }

    #[tokio::test]
    async fn to_json_array() {
        let v = RespValue::Array(Some(vec![
            RespValue::Integer(1),
            RespValue::BulkString(Some(b"two".to_vec())),
        ]));
        assert_eq!(v.to_json(), serde_json::json!([1, "two"]));
    }

    #[tokio::test]
    async fn to_json_boolean() {
        assert_eq!(RespValue::Boolean(true).to_json(), serde_json::json!(true));
    }

    #[tokio::test]
    async fn to_json_double() {
        let v = RespValue::Double(3.5);
        assert_eq!(v.to_json(), serde_json::json!(3.5));
    }

    #[tokio::test]
    async fn to_json_map() {
        let v = RespValue::Map(vec![(
            RespValue::SimpleString("name".into()),
            RespValue::BulkString(Some(b"Redis".to_vec())),
        )]);
        assert_eq!(v.to_json(), serde_json::json!({"name": "Redis"}));
    }

    // ── Edge cases ──

    #[tokio::test]
    async fn connection_closed() {
        let result = parse(b"").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("closed"));
    }

    #[tokio::test]
    async fn unknown_type() {
        let result = parse(b"?unknown\r\n").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn multiple_values_sequential() {
        // Parse two values from one stream
        let input = b"+OK\r\n:42\r\n";
        let mut reader = BufReader::new(&input[..]);
        let v1 = parse_resp(&mut reader).await.unwrap();
        let v2 = parse_resp(&mut reader).await.unwrap();
        assert_eq!(v1, RespValue::SimpleString("OK".into()));
        assert_eq!(v2, RespValue::Integer(42));
    }
}
