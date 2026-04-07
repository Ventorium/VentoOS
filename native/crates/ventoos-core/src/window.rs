use serde::{Deserialize, Serialize};

/// Window state in the `WebOS` shell.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WindowStatus {
    Created,
    Opening,
    Active,
    Blurred,
    Minimized,
    Restored,
    Closing,
    Closed,
}

/// Persisted window state for recovery.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub id: String,
    pub app_id: String,
    pub title: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub z_index: u32,
    pub status: WindowStatus,
    pub is_maximized: bool,
    pub tab_states: Option<serde_json::Value>,
    pub app_state: Option<serde_json::Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_window_state_serialization() {
        let state = WindowState {
            id: "win-1234567890-1".to_string(),
            app_id: "kubernetes".to_string(),
            title: "Kubernetes - production".to_string(),
            x: 100.0,
            y: 50.0,
            width: 1200.0,
            height: 800.0,
            z_index: 1,
            status: WindowStatus::Active,
            is_maximized: false,
            tab_states: None,
            app_state: None,
        };
        let json = serde_json::to_string(&state).unwrap();
        let deserialized: WindowState = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "win-1234567890-1");
        assert_eq!(deserialized.app_id, "kubernetes");
        assert_eq!(deserialized.status, WindowStatus::Active);
    }
}
