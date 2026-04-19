use std::path::PathBuf;
use std::process::Command;

fn main() {
    // Declare the custom cfg so rustc doesn't warn about it.
    println!("cargo::rustc-check-cfg=cfg(embedded_ventofs)");

    // Only embed on macOS builds.
    if std::env::var("TARGET").unwrap_or_default().contains("darwin")
        || cfg!(target_os = "macos")
    {
        let out_dir = PathBuf::from(std::env::var("OUT_DIR").unwrap());
        let zip_output = out_dir.join("VentoFS.zip");

        // Path to the pre-built VentoFS.app bundle (relative to this crate).
        let app_src = PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../../fileprovider/build/VentoFS.app"));

        if app_src.exists() {
            // Re-build the zip whenever the app bundle changes.
            println!("cargo:rerun-if-changed={}", app_src.display());

            // Zip from the parent directory so the archive contains
            // "VentoFS.app/Contents/..." rather than just "Contents/...".
            let parent = app_src.parent().expect("VentoFS.app has no parent dir");
            let status = Command::new("zip")
                .arg("-r")
                .arg("-q")
                .arg(&zip_output)
                .arg("VentoFS.app")
                .current_dir(parent)
                .status();

            match status {
                Ok(s) if s.success() => {
                    println!("cargo:warning=VentoFS.app embedded ({})", zip_output.display());
                    // Let the Rust code know a zip is available.
                    println!("cargo:rustc-cfg=embedded_ventofs");
                }
                _ => {
                    println!("cargo:warning=Failed to zip VentoFS.app — will fall back to remote download");
                }
            }
        } else {
            println!(
                "cargo:warning=VentoFS.app not found at {} — will fall back to remote download",
                app_src.display()
            );
        }
    }
}
