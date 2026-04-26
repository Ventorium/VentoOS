use std::net::IpAddr;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum TargetGuardError {
    #[error("Target host is required")]
    MissingHost,
    #[error("Target host is not allowed: {0}")]
    ForbiddenHost(String),
}

pub fn validate_host(host: &str) -> Result<(), TargetGuardError> {
    let normalized = normalize_host(host).ok_or(TargetGuardError::MissingHost)?;

    if is_forbidden_hostname(&normalized) {
        return Err(TargetGuardError::ForbiddenHost(normalized));
    }

    if let Ok(ip) = normalized.parse::<IpAddr>()
        && is_forbidden_ip(ip) {
            return Err(TargetGuardError::ForbiddenHost(normalized));
    }

    Ok(())
}

fn normalize_host(host: &str) -> Option<String> {
    let trimmed = host.trim();
    if trimmed.is_empty() {
        return None;
    }

    Some(
        trimmed
            .trim_start_matches('[')
            .trim_end_matches(']')
            .trim_end_matches('.')
            .to_ascii_lowercase(),
    )
}

fn is_forbidden_hostname(host: &str) -> bool {
    matches!(
        host,
        "localhost"
            | "localhost.localdomain"
            | "local"
            | "localdomain"
            | "ip6-localhost"
            | "ip6-loopback"
            | "broadcasthost"
            | "host.docker.internal"
            | "gateway.docker.internal"
            | "kubernetes.docker.internal"
            | "metadata"
            | "metadata.google.internal"
    ) || host.ends_with(".localhost")
        || host.split('.').next_back().is_some_and(|segment| segment.eq_ignore_ascii_case("local"))
}

fn is_forbidden_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(addr) => {
            addr.is_loopback()
                || addr.is_private()
                || addr.is_link_local()
                || addr.is_unspecified()
                || addr.is_broadcast()
        }
        IpAddr::V6(addr) => {
            addr.is_loopback()
                || addr.is_unique_local()
                || addr.is_unicast_link_local()
                || addr.is_unspecified()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::validate_host;

    #[test]
    fn validate_host_rejects_local_and_private_targets() {
        for host in [
            "localhost",
            "127.0.0.1",
            "192.168.1.25",
            "169.254.10.20",
            "[::1]",
            "fc00::1",
            "host.docker.internal",
        ] {
            assert!(validate_host(host).is_err(), "expected {host} to be rejected");
        }

        assert!(validate_host("api.example.com").is_ok());
    }
}