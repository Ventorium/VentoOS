use ventoos_mount::validate_mount_path;

#[test]
fn validate_mount_path_rejects_traversal_segments() {
    let error = validate_mount_path("../escape").expect_err("path traversal should be rejected");
    assert!(error.contains(".."));
}

#[test]
fn validate_mount_path_accepts_normal_paths() {
    assert!(validate_mount_path("projects/demo").is_ok());
}
