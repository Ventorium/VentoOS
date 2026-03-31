use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Top-level error type for `VentoOS`.
#[derive(Debug, Error)]
pub enum VentoError {
    #[error("Connection error: {0}")]
    Connection(String),

    #[error("Authentication error: {0}")]
    Auth(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Task error: {0}")]
    Task(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Timeout: {0}")]
    Timeout(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

/// Serializable error response for API.
#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub code: String,
    pub message: String,
}

impl From<&VentoError> for ErrorResponse {
    fn from(err: &VentoError) -> Self {
        let code = match err {
            VentoError::Connection(_) => "CONNECTION_ERROR",
            VentoError::Auth(_) => "AUTH_ERROR",
            VentoError::NotFound(_) => "NOT_FOUND",
            VentoError::PermissionDenied(_) => "PERMISSION_DENIED",
            VentoError::Validation(_) => "VALIDATION_ERROR",
            VentoError::Task(_) => "TASK_ERROR",
            VentoError::Internal(_) => "INTERNAL_ERROR",
            VentoError::Database(_) => "DATABASE_ERROR",
            VentoError::Timeout(_) => "TIMEOUT",
            VentoError::Io(_) => "IO_ERROR",
            VentoError::Serialization(_) => "SERIALIZATION_ERROR",
        };
        Self {
            code: code.to_string(),
            message: err.to_string(),
        }
    }
}

pub type VentoResult<T> = Result<T, VentoError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let err = VentoError::NotFound("resource xyz".to_string());
        assert_eq!(err.to_string(), "Not found: resource xyz");
    }

    #[test]
    fn test_error_response_conversion() {
        let err = VentoError::Auth("invalid token".to_string());
        let resp = ErrorResponse::from(&err);
        assert_eq!(resp.code, "AUTH_ERROR");
        assert!(resp.message.contains("invalid token"));
    }
}
