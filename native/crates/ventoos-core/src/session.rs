use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::types::Id;

/// Session status.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Active,
    Expired,
    Refreshing,
    Closed,
}

/// A session represents an active authenticated context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: Id,
    pub connection_id: Id,
    pub status: SessionStatus,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub metadata: serde_json::Value,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::new_id;

    #[test]
    fn test_session_serialization() {
        let session = Session {
            id: new_id(),
            connection_id: new_id(),
            status: SessionStatus::Active,
            expires_at: Some(Utc::now()),
            created_at: Utc::now(),
            metadata: serde_json::json!({}),
        };
        let json = serde_json::to_string(&session).unwrap();
        let deserialized: Session = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.status, SessionStatus::Active);
    }
}
