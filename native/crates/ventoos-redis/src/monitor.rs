//! MONITOR command streaming.
//!
//! Provides an abstraction for starting/stopping MONITOR mode
//! and parsing the live command trace output.

use crate::types::MonitorEntry;

/// Parse a raw MONITOR output line into a structured entry.
///
/// Format: `1234567890.123456 [0 127.0.0.1:12345] "SET" "key" "value"`
pub fn parse_monitor_line(line: &str) -> MonitorEntry {
    let line = line.trim();
    let raw = line.to_string();

    let mut timestamp = 0.0_f64;
    let mut client = String::new();
    let mut command = String::new();
    let mut args = Vec::new();

    if let Some(space_idx) = line.find(' ') {
        timestamp = line[..space_idx].parse().unwrap_or(0.0);
        let rest = &line[space_idx + 1..];

        if let Some(bracket_end) = rest.find(']') {
            client = rest[1..bracket_end].to_string();
            let cmd_part = rest[bracket_end + 2..].trim();

            // Parse quoted arguments
            let mut current = String::new();
            let mut in_quote = false;

            for ch in cmd_part.chars() {
                match ch {
                    '"' => {
                        if in_quote {
                            if command.is_empty() {
                                command.clone_from(&current);
                            } else {
                                args.push(current.clone());
                            }
                            current.clear();
                        }
                        in_quote = !in_quote;
                    }
                    _ if in_quote => current.push(ch),
                    _ => {} // skip spaces between quotes
                }
            }
        }
    }

    MonitorEntry {
        timestamp,
        client,
        command,
        args,
        raw,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_monitor_line() {
        let line = r#"1617000000.123456 [0 127.0.0.1:12345] "SET" "mykey" "myvalue""#;
        let entry = parse_monitor_line(line);
        assert!((entry.timestamp - 1_617_000_000.123_456).abs() < 0.001);
        assert_eq!(entry.client, "0 127.0.0.1:12345");
        assert_eq!(entry.command, "SET");
        assert_eq!(entry.args, vec!["mykey", "myvalue"]);
    }

    #[test]
    fn test_parse_monitor_line_no_args() {
        let line = r#"1617000000.000000 [0 127.0.0.1:12345] "PING""#;
        let entry = parse_monitor_line(line);
        assert_eq!(entry.command, "PING");
        assert!(entry.args.is_empty());
    }
}
