use serde::{Deserialize, Serialize};

/// Login request.
#[derive(Debug, Serialize, Deserialize)]
pub struct LoginRequest {
    pub password: String,
}

/// Login response.
#[derive(Debug, Serialize, Deserialize)]
pub struct LoginResponse {
    pub token: String,
}

/// Change password request.
#[derive(Debug, Serialize, Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

/// Auth status response.
#[derive(Debug, Serialize, Deserialize)]
pub struct AuthStatus {
    pub initialized: bool,
    pub locked: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_login_request_serialization() {
        let req = LoginRequest {
            password: "secret".to_string(),
        };
        let json = serde_json::to_string(&req).unwrap();
        let deserialized: LoginRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.password, "secret");
    }
}
