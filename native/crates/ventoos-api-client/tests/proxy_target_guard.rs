use ventoos_api_client::proxy::{execute_proxy, ProxyError, ProxyRequest};

#[tokio::test]
async fn proxy_rejects_loopback_target_in_integration_test() {
    let request = ProxyRequest {
        method: "GET".into(),
        url: "http://127.0.0.1:8080/health".into(),
        headers: None,
        body: None,
        timeout_ms: Some(500),
        follow_redirects: Some(false),
    };

    let error = execute_proxy(request)
        .await
        .expect_err("loopback target should be rejected");
    assert!(matches!(error, ProxyError::ForbiddenTarget(_)));
}
