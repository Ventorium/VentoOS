use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Universal identifier type used across VentoOS.
pub type Id = Uuid;

/// Generate a new unique ID.
pub fn new_id() -> Id {
    Uuid::new_v4()
}

/// Standard API response wrapper.
#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse<T: Serialize> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(message: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message.into()),
        }
    }
}

/// Pagination parameters.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pagination {
    pub page: u32,
    pub page_size: u32,
}

impl Default for Pagination {
    fn default() -> Self {
        Self {
            page: 1,
            page_size: 50,
        }
    }
}

/// Paginated response.
#[derive(Debug, Serialize, Deserialize)]
pub struct PaginatedResponse<T: Serialize> {
    pub items: Vec<T>,
    pub total: u64,
    pub page: u32,
    pub page_size: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_id_uniqueness() {
        let id1 = new_id();
        let id2 = new_id();
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_api_response_ok() {
        let resp = ApiResponse::ok("hello");
        assert!(resp.success);
        assert_eq!(resp.data, Some("hello"));
        assert!(resp.error.is_none());
    }

    #[test]
    fn test_api_response_err() {
        let resp = ApiResponse::<()>::err("something went wrong");
        assert!(!resp.success);
        assert!(resp.data.is_none());
        assert_eq!(resp.error, Some("something went wrong".to_string()));
    }

    #[test]
    fn test_pagination_default() {
        let p = Pagination::default();
        assert_eq!(p.page, 1);
        assert_eq!(p.page_size, 50);
    }
}
