#!/usr/bin/env bash
# build.sh — Build, install, and uninstall VentoFS FileProvider extension.
#
# Usage:
#   ./build.sh build       Build the .app bundle with embedded .appex
#   ./build.sh install     Copy to ~/Library/VentoOS/ and register
#   ./build.sh uninstall   Remove from ~/Library/VentoOS/
#   ./build.sh clean       Remove build artifacts
#
# Prerequisites:
#   - macOS 12.0+
#   - Xcode Command Line Tools (swift, codesign)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"
SOURCES="${SCRIPT_DIR}/Sources"
RESOURCES="${SCRIPT_DIR}/Resources"

# Bundle identifiers
HOST_BUNDLE_ID="io.ventoos.VentoFS"
EXT_BUNDLE_ID="io.ventoos.VentoFS.FileProvider"

# Output paths
APP_BUNDLE="${BUILD_DIR}/VentoFS.app"
APPEX_BUNDLE="${APP_BUNDLE}/Contents/PlugIns/VentoFSFileProvider.appex"

INSTALL_DIR="${HOME}/Library/VentoOS"

# Minimum macOS deployment target
MIN_MACOS="12.0"

# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────

red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
info()  { printf '→ %s\n' "$*"; }
die()   { red "ERROR: $*" >&2; exit 1; }

check_swift() {
    command -v swiftc >/dev/null 2>&1 || die "swiftc not found. Install Xcode Command Line Tools: xcode-select --install"
    info "Using $(swiftc --version | head -1)"
}

# ──────────────────────────────────────────────────────────────────────
# Build
# ──────────────────────────────────────────────────────────────────────

cmd_build() {
    check_swift

    info "Cleaning previous build …"
    rm -rf "${BUILD_DIR}"

    # ── Create bundle directory structures ────────────────────────────
    info "Creating bundle structures …"

    # Host app
    mkdir -p "${APP_BUNDLE}/Contents/MacOS"
    mkdir -p "${APP_BUNDLE}/Contents/Resources"

    # Extension appex
    mkdir -p "${APPEX_BUNDLE}/Contents/MacOS"
    mkdir -p "${APPEX_BUNDLE}/Contents/Resources"

    # ── Compile extension ─────────────────────────────────────────────
    info "Compiling FileProvider extension …"

    local ext_swift_files=(
        "${SOURCES}/VentoAPIClient.swift"
        "${SOURCES}/FileProviderItem.swift"
        "${SOURCES}/FileProviderEnumerator.swift"
        "${SOURCES}/Extension.swift"
    )

    swiftc \
        -target "arm64-apple-macos${MIN_MACOS}" \
        -sdk "$(xcrun --show-sdk-path)" \
        -F "$(xcrun --show-sdk-path)/System/Library/Frameworks" \
        -framework FileProvider \
        -framework UniformTypeIdentifiers \
        -emit-library \
        -module-name VentoFSFileProvider \
        -o "${APPEX_BUNDLE}/Contents/MacOS/VentoFSFileProvider" \
        "${ext_swift_files[@]}"

    # Remove Swift module artifacts that break codesigning
    rm -f "${APPEX_BUNDLE}/Contents/MacOS/"*.abi.json
    rm -f "${APPEX_BUNDLE}/Contents/MacOS/"*.swiftmodule
    rm -f "${APPEX_BUNDLE}/Contents/MacOS/"*.swiftdoc

    # ── Compile host app (domain manager CLI) ────────────────────────
    info "Compiling host app (domain manager CLI) …"

    local host_swift_files=(
        "${SOURCES}/DomainManager.swift"
        "${SOURCES}/main.swift"
    )

    swiftc \
        -target "arm64-apple-macos${MIN_MACOS}" \
        -sdk "$(xcrun --show-sdk-path)" \
        -F "$(xcrun --show-sdk-path)/System/Library/Frameworks" \
        -framework FileProvider \
        -o "${APP_BUNDLE}/Contents/MacOS/VentoFS" \
        "${host_swift_files[@]}"

    # ── Copy Info.plists and icon ─────────────────────────────────────
    info "Copying plists, entitlements, and icon …"

    cp "${RESOURCES}/Host-Info.plist"      "${APP_BUNDLE}/Contents/Info.plist"
    cp "${RESOURCES}/Extension-Info.plist" "${APPEX_BUNDLE}/Contents/Info.plist"

    # Copy AppIcon if present
    if [[ -f "${RESOURCES}/AppIcon.icns" ]]; then
        cp "${RESOURCES}/AppIcon.icns" "${APP_BUNDLE}/Contents/Resources/AppIcon.icns"
    fi

    # ── Ad-hoc code signing ───────────────────────────────────────────
    info "Signing with ad-hoc identity …"

    codesign --force --sign - \
        --entitlements "${RESOURCES}/VentoFS.entitlements" \
        "${APPEX_BUNDLE}"

    codesign --force --sign - \
        --entitlements "${RESOURCES}/VentoFS.entitlements" \
        "${APP_BUNDLE}"

    green "Build complete → ${APP_BUNDLE}"
}

# ──────────────────────────────────────────────────────────────────────
# Install
# ──────────────────────────────────────────────────────────────────────

cmd_install() {
    [[ -d "${APP_BUNDLE}" ]] || die "Build first: $0 build"

    info "Installing to ${INSTALL_DIR} …"
    mkdir -p "${INSTALL_DIR}"
    rm -rf "${INSTALL_DIR}/VentoFS.app"
    cp -R "${APP_BUNDLE}" "${INSTALL_DIR}/VentoFS.app"

    info "Opening app to trigger extension registration …"
    open "${INSTALL_DIR}/VentoFS.app"

    green "Installed. The extension should appear in System Settings → Extensions → File Provider."
    info  "You may need to enable it manually on first install."
}

# ──────────────────────────────────────────────────────────────────────
# Uninstall
# ──────────────────────────────────────────────────────────────────────

cmd_uninstall() {
    info "Removing ${INSTALL_DIR}/VentoFS.app …"
    rm -rf "${INSTALL_DIR}/VentoFS.app"
    green "Uninstalled. You may need to log out/in for Finder to reflect the change."
}

# ──────────────────────────────────────────────────────────────────────
# Clean
# ──────────────────────────────────────────────────────────────────────

cmd_clean() {
    info "Cleaning build directory …"
    rm -rf "${BUILD_DIR}"
    green "Clean."
}

# ──────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────

case "${1:-build}" in
    build)     cmd_build     ;;
    install)   cmd_install   ;;
    uninstall) cmd_uninstall ;;
    clean)     cmd_clean     ;;
    *)
        echo "Usage: $0 {build|install|uninstall|clean}"
        exit 1
        ;;
esac
