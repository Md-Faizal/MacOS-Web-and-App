#!/usr/bin/env bash
set -euo pipefail

################################################################################
# ENTERPRISE ANDROID OTA UPDATE PUBLISHER (Bash)
#
# Builds the APK, computes SHA-256 checksum, archives the previous version,
# writes an enhanced manifest with integrity metadata, copies to local
# production, and atomically deploys to the remote Ubuntu VM via SSH.
#
# Usage:
#   bash scripts/publish-android-update.sh                             # Interactive
#   bash scripts/publish-android-update.sh --version-name 1.0.5       # Non-interactive
#   bash scripts/publish-android-update.sh --dry-run                   # Preview only
#
# Failsafes:
#   - SHA-256 checksum on every built APK
#   - Previous version archived before overwrite
#   - Atomic remote deploy (SCP to temp dir, then SSH mv)
#   - Build verification (non-zero APK exists)
#   - Dry-run mode for safe previewing
################################################################################

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
BACKEND_DIR="$ROOT_DIR/backend"
UPLOAD_DIR="$BACKEND_DIR/uploads/android-app"
ARCHIVE_DIR="$UPLOAD_DIR/archive"
APK_NAME="latest.apk"
MANIFEST_PATH="$UPLOAD_DIR/update-manifest.json"
HISTORY_PATH="$UPLOAD_DIR/version-history.json"
SSH_CMD="ssh"
SCP_CMD="scp"

INTERACTIVE=false
SKIP_REMOTE=false
DRY_RUN=false
VERSION_NAME=""
VERSION_CODE=""
RELEASE_NOTES=""
REMOTE_HOST="my-mac"
REMOTE_USER=""
REMOTE_PATH="/home/ubuntu/MacOS-Production"

# ─── Colors ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;37m'
NC='\033[0m'

step()  { echo -e "\n${CYAN}[STEP]${NC} $1"; }
ok()    { echo -e "  ${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "  ${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "  ${RED}[ERR]${NC} $1" >&2; }
info()  { echo -e "  ${GRAY}[INFO]${NC} $1"; }

# ─── Parse Arguments ────────────────────────────────────────────────────────

POSITIONALS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --interactive|-i) INTERACTIVE=true; shift ;;
    --skip-remote)    SKIP_REMOTE=true; shift ;;
    --dry-run)        DRY_RUN=true; shift ;;
    --version-name)   VERSION_NAME="$2"; shift 2 ;;
    --version-code)   VERSION_CODE="$2"; shift 2 ;;
    --release-notes)  RELEASE_NOTES="$2"; shift 2 ;;
    --remote-host)    REMOTE_HOST="$2"; shift 2 ;;
    --remote-user)    REMOTE_USER="$2"; shift 2 ;;
    --remote-path)    REMOTE_PATH="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: bash scripts/publish-android-update.sh [--interactive] [--skip-remote] [--dry-run] [--version-name X] [--version-code N] [--release-notes TEXT]"
      exit 0
      ;;
    *) POSITIONALS+=("$1"); shift ;;
  esac
done

[[ ${#POSITIONALS[@]} -ge 1 ]] && VERSION_NAME="${POSITIONALS[0]}"
[[ ${#POSITIONALS[@]} -ge 2 ]] && VERSION_CODE="${POSITIONALS[1]}"
[[ ${#POSITIONALS[@]} -ge 3 ]] && RELEASE_NOTES="${POSITIONALS[2]}"

# ─── Ensure directories ─────────────────────────────────────────────────────

mkdir -p "$UPLOAD_DIR" "$ARCHIVE_DIR"

# ─── Detect Gradle wrapper ──────────────────────────────────────────────────

if [[ -f "$ANDROID_DIR/gradlew" ]]; then
  GRADLE_WRAPPER="$ANDROID_DIR/gradlew"
elif [[ -f "$ANDROID_DIR/gradlew.bat" ]]; then
  GRADLE_WRAPPER="$ANDROID_DIR/gradlew.bat"
else
  err "Android project not found at $ANDROID_DIR"
  exit 1
fi

# ─── Detect SSH/SCP binaries (Windows compatibility) ─────────────────────────

if [[ -f "/c/Windows/System32/OpenSSH/ssh.exe" ]]; then
  SSH_CMD="/c/Windows/System32/OpenSSH/ssh.exe"
elif [[ -f "/mnt/c/Windows/System32/OpenSSH/ssh.exe" ]]; then
  SSH_CMD="/mnt/c/Windows/System32/OpenSSH/ssh.exe"
elif command -v ssh.exe >/dev/null 2>&1; then
  SSH_CMD="$(command -v ssh.exe)"
fi

if [[ -f "/c/Windows/System32/OpenSSH/scp.exe" ]]; then
  SCP_CMD="/c/Windows/System32/OpenSSH/scp.exe"
elif [[ -f "/mnt/c/Windows/System32/OpenSSH/scp.exe" ]]; then
  SCP_CMD="/mnt/c/Windows/System32/OpenSSH/scp.exe"
elif command -v scp.exe >/dev/null 2>&1; then
  SCP_CMD="$(command -v scp.exe)"
fi

# ─── Detect Node.js ──────────────────────────────────────────────────────────

find_node_bin() {
  if command -v node.exe >/dev/null 2>&1; then command -v node.exe; return 0; fi
  if command -v node >/dev/null 2>&1; then command -v node; return 0; fi
  return 1
}

NODE_BIN="$(find_node_bin || true)"
if [[ -z "$NODE_BIN" ]]; then
  err "Node.js not found on PATH. Install Node.js before running this script."
  exit 1
fi

# ─── Detect JAVA_HOME ────────────────────────────────────────────────────────

is_valid_jdk() {
  local dir="$1"
  [[ -z "$dir" ]] && return 1
  [[ "$dir" == *"Common Files"* || "$dir" == *"Oracle/Java"* || "$dir" == *"Oracle\\Java"* ]] && return 1
  if [[ -f "$dir/bin/java" || -f "$dir/bin/java.exe" || -f "$dir/bin/javac" || -f "$dir/bin/javac.exe" ]]; then
    return 0
  fi
  return 1
}

find_java_home() {
  if [[ -n "${JAVA_HOME:-}" ]] && is_valid_jdk "$JAVA_HOME"; then
    echo "$JAVA_HOME"
    return 0
  fi

  local candidates=(
    "/mnt/c/Program Files/Android/Android Studio/jbr"
    "/c/Program Files/Android/Android Studio/jbr"
    "C:/Program Files/Android/Android Studio/jbr"
    "/mnt/c/Program Files/Java/jdk-23"
    "/c/Program Files/Java/jdk-23"
    "C:/Program Files/Java/jdk-23"
    "/mnt/c/Program Files/Java/jdk-17"
    "/c/Program Files/Java/jdk-17"
  )

  for cand in "${candidates[@]}"; do
    if is_valid_jdk "$cand"; then
      echo "$cand"
      return 0
    fi
  done

  for parent in "$HOME/.gradle/jdks" "/mnt/c/Users/HP/.gradle/jdks" "/c/Users/HP/.gradle/jdks"; do
    if [[ -d "$parent" ]]; then
      for dir in "$parent"/*; do
        if is_valid_jdk "$dir"; then
          echo "$dir"
          return 0
        fi
      done
    fi
  done

  if command -v java >/dev/null 2>&1; then
    local java_bin; java_bin="$(command -v java)"
    local parent_dir; parent_dir="$(dirname "$(dirname "$java_bin")")"
    if is_valid_jdk "$parent_dir"; then
      echo "$parent_dir"
      return 0
    fi
  fi

  return 1
}

to_win_path() {
  local p="$1"
  if command -v wslpath >/dev/null 2>&1; then
    wslpath -w "$p" 2>/dev/null || echo "$p"
  elif command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$p" 2>/dev/null || echo "$p"
  else
    echo "$p" | sed -e 's|^/mnt/\([a-zA-Z]\)/|\1:/|' -e 's|^/\([a-zA-Z]\)/|\1:/|' -e 's|/|\\|g'
  fi
}

JAVA_HOME_PATH="$(find_java_home || true)"
WIN_JAVA_HOME=""
if [[ -n "$JAVA_HOME_PATH" ]]; then
  WIN_JAVA_HOME="$(to_win_path "$JAVA_HOME_PATH")"
  export JAVA_HOME="$WIN_JAVA_HOME"
  export WSLENV="JAVA_HOME/p:${WSLENV:-}"
  info "Using JAVA_HOME: $JAVA_HOME"
fi

# ─── Read Current Manifest ──────────────────────────────────────────────────

CURRENT_VERSION_NAME="1.0.0"
CURRENT_VERSION_CODE="1"
CURRENT_RELEASE_NOTES="Updated via publish script"

if [[ -f "$MANIFEST_PATH" ]]; then
  manifest_json="$("$NODE_BIN" - "$MANIFEST_PATH" <<'NODE'
const fs = require('fs');
const [manifestPath] = process.argv.slice(2);
try {
  const obj = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(JSON.stringify({
    versionName: obj.versionName || '1.0.0',
    versionCode: String(obj.versionCode || 1),
    releaseNotes: obj.releaseNotes || 'Updated via publish script'
  }));
} catch (error) {
  console.log(JSON.stringify({ versionName: '1.0.0', versionCode: '1', releaseNotes: 'Updated via publish script' }));
}
NODE
)"
  CURRENT_VERSION_NAME="$("$NODE_BIN" -e 'const obj=JSON.parse(process.argv[1]); console.log(obj.versionName)' "$manifest_json")"
  CURRENT_VERSION_CODE="$("$NODE_BIN" -e 'const obj=JSON.parse(process.argv[1]); console.log(obj.versionCode)' "$manifest_json")"
  CURRENT_RELEASE_NOTES="$("$NODE_BIN" -e 'const obj=JSON.parse(process.argv[1]); console.log(obj.releaseNotes)' "$manifest_json")"
fi

# ─── Version Bump Selection ─────────────────────────────────────────────────

SELECTED_VERSION_NAME="$VERSION_NAME"
SELECTED_VERSION_CODE="$VERSION_CODE"
SELECTED_RELEASE_NOTES="$RELEASE_NOTES"

if [[ "$INTERACTIVE" == true ]] || [[ -z "$VERSION_NAME" && -z "$VERSION_CODE" ]]; then
  echo ""
  echo "Current version: $CURRENT_VERSION_NAME ($CURRENT_VERSION_CODE)"
  read -r -p "Version bump? [p]atch [m]inor [M]ajor [n]one [s]kip (default: patch): " version_choice
  version_choice="${version_choice:-patch}"
  version_choice="${version_choice,,}"

  IFS='.' read -r major minor patch <<< "$CURRENT_VERSION_NAME"
  major="${major:-1}"; minor="${minor:-0}"; patch="${patch:-0}"

  case "$version_choice" in
    p|patch)  SELECTED_VERSION_NAME="$major.$minor.$((patch + 1))"; SELECTED_VERSION_CODE="$((CURRENT_VERSION_CODE + 1))" ;;
    m|minor)  SELECTED_VERSION_NAME="$major.$((minor + 1)).0";      SELECTED_VERSION_CODE="$((CURRENT_VERSION_CODE + 1))" ;;
    major|M)  SELECTED_VERSION_NAME="$((major + 1)).0.0";           SELECTED_VERSION_CODE="$((CURRENT_VERSION_CODE + 1))" ;;
    n|none|s|skip) SELECTED_VERSION_NAME="$CURRENT_VERSION_NAME";   SELECTED_VERSION_CODE="$CURRENT_VERSION_CODE" ;;
    *) warn "Unknown option '$version_choice'; using patch."
       SELECTED_VERSION_NAME="$major.$minor.$((patch + 1))";       SELECTED_VERSION_CODE="$((CURRENT_VERSION_CODE + 1))" ;;
  esac
fi

[[ -n "$VERSION_NAME" ]] && SELECTED_VERSION_NAME="$VERSION_NAME"
[[ -n "$VERSION_CODE" ]] && SELECTED_VERSION_CODE="$VERSION_CODE"

# Release notes
if [[ "$INTERACTIVE" == true ]] || [[ -z "$RELEASE_NOTES" ]]; then
  read -r -p "Release notes (press Enter for default, or type [s]kip to leave blank): " notes_input
  if [[ "$notes_input" =~ ^(s|skip)$ ]]; then
    SELECTED_RELEASE_NOTES=""
  elif [[ -n "$notes_input" ]]; then
    SELECTED_RELEASE_NOTES="$notes_input"
  else
    SELECTED_RELEASE_NOTES="$CURRENT_RELEASE_NOTES"
  fi
else
  SELECTED_RELEASE_NOTES="$RELEASE_NOTES"
fi

[[ -z "$SELECTED_VERSION_NAME" ]] && SELECTED_VERSION_NAME="$CURRENT_VERSION_NAME"
[[ -z "$SELECTED_VERSION_CODE" ]] && SELECTED_VERSION_CODE="$CURRENT_VERSION_CODE"
[[ -z "$SELECTED_RELEASE_NOTES" ]] && SELECTED_RELEASE_NOTES="$CURRENT_RELEASE_NOTES"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  ANDROID OTA UPDATE PUBLISHER"
echo "  Version: $SELECTED_VERSION_NAME ($SELECTED_VERSION_CODE)"
echo "  Notes:   ${SELECTED_RELEASE_NOTES//$'\n'/ }"
if [[ "$DRY_RUN" == true ]]; then
  echo -e "  MODE:    ${YELLOW}DRY RUN (no changes)${NC}"
fi
echo "════════════════════════════════════════════════════════════"

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1: BUILD APK
# ═══════════════════════════════════════════════════════════════════════════════

step "Building APK via Gradle..."

APK_PATH="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"

if [[ "$DRY_RUN" == true ]]; then
  info "[DRY RUN] Would build APK with versionName=$SELECTED_VERSION_NAME versionCode=$SELECTED_VERSION_CODE"
else
  (
    cd "$ANDROID_DIR"
    if [[ "$GRADLE_WRAPPER" == *.bat ]]; then
      if command -v cmd.exe >/dev/null 2>&1; then
        if [[ -n "${WIN_JAVA_HOME:-}" ]]; then
          cmd.exe /c "set \"JAVA_HOME=$WIN_JAVA_HOME\" && gradlew.bat assembleDebug -PversionName=$SELECTED_VERSION_NAME -PversionCode=$SELECTED_VERSION_CODE"
        else
          cmd.exe /c "gradlew.bat assembleDebug -PversionName=$SELECTED_VERSION_NAME -PversionCode=$SELECTED_VERSION_CODE"
        fi
      else
        "$GRADLE_WRAPPER" assembleDebug -PversionName="$SELECTED_VERSION_NAME" -PversionCode="$SELECTED_VERSION_CODE"
      fi
    else
      "$GRADLE_WRAPPER" assembleDebug -PversionName="$SELECTED_VERSION_NAME" -PversionCode="$SELECTED_VERSION_CODE"
    fi
  )

  if [[ ! -f "$APK_PATH" ]]; then
    err "BUILD FAILED: APK not found at $APK_PATH"
    exit 1
  fi

  APK_FILE_SIZE=$(stat -f%z "$APK_PATH" 2>/dev/null || stat -c%s "$APK_PATH" 2>/dev/null || echo 0)
  if [[ "$APK_FILE_SIZE" -eq 0 ]]; then
    err "BUILD FAILED: APK is empty (0 bytes)"
    exit 1
  fi

  APK_SIZE_MB=$(echo "scale=1; $APK_FILE_SIZE / 1048576" | bc 2>/dev/null || echo "?")
  ok "APK built successfully (${APK_SIZE_MB} MB)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2: COMPUTE SHA-256 CHECKSUM
# ═══════════════════════════════════════════════════════════════════════════════

step "Computing SHA-256 checksum..."

if [[ "$DRY_RUN" == true ]]; then
  SHA256="dry-run-no-hash"
  APK_FILE_SIZE=0
  info "[DRY RUN] Would compute SHA-256 of built APK"
else
  if command -v sha256sum >/dev/null 2>&1; then
    SHA256=$(sha256sum "$APK_PATH" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    SHA256=$(shasum -a 256 "$APK_PATH" | awk '{print $1}')
  else
    SHA256=$("$NODE_BIN" -e "const crypto=require('crypto'),fs=require('fs');console.log(crypto.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))" "$APK_PATH")
  fi

  APK_FILE_SIZE=$(stat -f%z "$APK_PATH" 2>/dev/null || stat -c%s "$APK_PATH" 2>/dev/null || echo 0)
  ok "SHA-256: $SHA256"
  ok "Size:    $APK_FILE_SIZE bytes"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3: ARCHIVE PREVIOUS VERSION
# ═══════════════════════════════════════════════════════════════════════════════

step "Archiving previous version..."

PREVIOUS_APK="$UPLOAD_DIR/$APK_NAME"

if [[ -f "$PREVIOUS_APK" ]]; then
  ARCHIVE_NAME="v${CURRENT_VERSION_NAME}_${CURRENT_VERSION_CODE}_$(date +%s).apk"
  ARCHIVE_DEST="$ARCHIVE_DIR/$ARCHIVE_NAME"

  if [[ "$DRY_RUN" == true ]]; then
    info "[DRY RUN] Would archive $APK_NAME -> archive/$ARCHIVE_NAME"
  else
    cp "$PREVIOUS_APK" "$ARCHIVE_DEST"
    ok "Archived: $ARCHIVE_NAME"

    # Append to version history (keep last 20)
    "$NODE_BIN" - "$HISTORY_PATH" "$CURRENT_VERSION_NAME" "$CURRENT_VERSION_CODE" "$CURRENT_RELEASE_NOTES" "$ARCHIVE_NAME" <<'NODE'
const fs = require('fs');
const [historyPath, vName, vCode, notes, archiveFile] = process.argv.slice(2);
let history = [];
try { history = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch {}
if (!Array.isArray(history)) history = [];
history.unshift({
  versionCode: Number(vCode),
  versionName: vName,
  releaseNotes: notes,
  archiveFile,
  archivedAt: new Date().toISOString()
});
history = history.slice(0, 20);
fs.writeFileSync(historyPath, JSON.stringify(history, null, 2) + '\n');
NODE

    # Prune old archives (keep last 5)
    archive_count=$(ls -1 "$ARCHIVE_DIR"/*.apk 2>/dev/null | wc -l)
    if [[ "$archive_count" -gt 5 ]]; then
      ls -1t "$ARCHIVE_DIR"/*.apk | tail -n +6 | while read -r old_file; do
        rm -f "$old_file"
        info "Pruned old archive: $(basename "$old_file")"
      done
    fi
  fi
else
  info "No previous APK to archive (first publish)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 4: COPY APK + WRITE ENHANCED MANIFEST
# ═══════════════════════════════════════════════════════════════════════════════

step "Writing enhanced manifest and copying APK..."

if [[ "$DRY_RUN" == true ]]; then
  info "[DRY RUN] Would copy APK to $UPLOAD_DIR/$APK_NAME"
  info "[DRY RUN] Would write manifest to $MANIFEST_PATH"
else
  cp "$APK_PATH" "$UPLOAD_DIR/$APK_NAME"

  "$NODE_BIN" - "$MANIFEST_PATH" "$SELECTED_VERSION_NAME" "$SELECTED_VERSION_CODE" "$SELECTED_RELEASE_NOTES" "$APK_NAME" "$SHA256" "$APK_FILE_SIZE" "$CURRENT_VERSION_NAME" "$CURRENT_VERSION_CODE" <<'NODE'
const fs = require('fs');
const [mPath, vName, vCode, notes, apkName, sha256, fileSize, prevName, prevCode] = process.argv.slice(2);
const manifest = {
  versionCode: Number(vCode),
  versionName: vName,
  apkUrl: '/api/android/update/latest',
  releaseNotes: notes,
  publishedAt: new Date().toISOString(),
  fileName: apkName,
  sha256: sha256,
  fileSize: Number(fileSize),
  minSdkVersion: 24,
  previousVersion: prevName && prevCode ? { versionCode: Number(prevCode), versionName: prevName } : null,
  downloadCount: 0
};
fs.writeFileSync(mPath, JSON.stringify(manifest, null, 2) + '\n');
NODE

  ok "Manifest written with SHA-256 integrity"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 5: COPY TO LOCAL PRODUCTION
# ═══════════════════════════════════════════════════════════════════════════════

step "Copying to local production folder..."

LOCAL_PROD_ROOT="$ROOT_DIR/../MacOS-Production"
LOCAL_PROD_UPLOAD_DIR="$LOCAL_PROD_ROOT/backend/uploads/android-app"

if [[ -d "$LOCAL_PROD_ROOT" ]]; then
  if [[ "$DRY_RUN" == true ]]; then
    info "[DRY RUN] Would copy to $LOCAL_PROD_UPLOAD_DIR"
  else
    mkdir -p "$LOCAL_PROD_UPLOAD_DIR"
    cp "$MANIFEST_PATH" "$LOCAL_PROD_UPLOAD_DIR/update-manifest.json"
    cp "$UPLOAD_DIR/$APK_NAME" "$LOCAL_PROD_UPLOAD_DIR/$APK_NAME"
    ok "Copied to local production: $LOCAL_PROD_UPLOAD_DIR"
  fi
else
  warn "Local production folder not found at $LOCAL_PROD_ROOT (skipping)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 6: ATOMIC REMOTE DEPLOYMENT VIA SSH
# ═══════════════════════════════════════════════════════════════════════════════

if [[ "$SKIP_REMOTE" != true && -n "$REMOTE_HOST" ]]; then
  step "Deploying to remote host (atomic upload)..."

  remote_target="$REMOTE_HOST"
  [[ -n "$REMOTE_USER" ]] && remote_target="$REMOTE_USER@$REMOTE_HOST"
  remote_dir="${REMOTE_PATH%/}/backend/uploads/android-app"
  remote_tmp_dir="$remote_dir/.tmp-deploy"

  if [[ "$DRY_RUN" == true ]]; then
    info "[DRY RUN] Would upload to $remote_target:$remote_dir"
    info "[DRY RUN] Strategy: SCP to temp dir -> SSH mv (atomic)"
  else
    # 1. Create temp dir on remote
    "$SSH_CMD" -o StrictHostKeyChecking=no "$remote_target" "mkdir -p '$remote_tmp_dir'"

    # 2. Upload to temp dir
    "$SCP_CMD" -o StrictHostKeyChecking=no "$MANIFEST_PATH" "$UPLOAD_DIR/$APK_NAME" "$remote_target:$remote_tmp_dir/"

    # 3. Atomic move from temp to production dir
    "$SSH_CMD" -o StrictHostKeyChecking=no "$remote_target" "mkdir -p '$remote_dir' && mv '$remote_tmp_dir/update-manifest.json' '$remote_dir/update-manifest.json' && mv '$remote_tmp_dir/$APK_NAME' '$remote_dir/$APK_NAME' && rmdir '$remote_tmp_dir'"

    ok "Atomically deployed to $remote_target:$remote_dir"
  fi
else
  info "Remote upload skipped"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "════════════════════════════════════════════════════════════"
if [[ "$DRY_RUN" == true ]]; then
  echo -e "  ${YELLOW}DRY RUN COMPLETE (no changes made)${NC}"
else
  echo -e "  ${GREEN}ANDROID OTA UPDATE PUBLISHED${NC}"
fi
echo "════════════════════════════════════════════════════════════"
echo "  Version:  $SELECTED_VERSION_NAME ($SELECTED_VERSION_CODE)"
echo "  SHA-256:  $SHA256"
echo "  Size:     $APK_FILE_SIZE bytes"
echo "  Notes:    ${SELECTED_RELEASE_NOTES//$'\n'/ }"
echo "  Manifest: $MANIFEST_PATH"
echo "  APK:      $UPLOAD_DIR/$APK_NAME"
echo "════════════════════════════════════════════════════════════"
echo ""
