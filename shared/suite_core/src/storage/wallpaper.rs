// ─────────────────────────────────────────────────────────────────────────────
// Pure Rust Wallpaper Engine & Asset Processing (Zero-GC Memory Guard)
// ─────────────────────────────────────────────────────────────────────────────

use super::dimensions::{inspect_image_metadata, ImageMetadata};
use crate::finance::ledger::sequencing::sha256_hex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WallpaperAssetScanResult {
    pub is_valid: bool,
    pub format: String,
    pub width: u32,
    pub height: u32,
    pub aspect_ratio: String,
    pub resolution_label: String,
    pub checksum_sha256: String,
    pub byte_size: usize,
    pub is_4k_or_higher: bool,
    pub recommended_category: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FitMode {
    Cover,
    Contain,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResizedDimensions {
    pub target_width: u32,
    pub target_height: u32,
    pub scale_factor_x: u32, // scaled by 1000
    pub scale_factor_y: u32, // scaled by 1000
}

/// Calculate optimal thumbnail / preview bounding dimensions with aspect ratio preservation
pub fn calculate_fit_dimensions(
    orig_w: u32,
    orig_h: u32,
    max_w: u32,
    max_h: u32,
    mode: FitMode,
) -> ResizedDimensions {
    if orig_w == 0 || orig_h == 0 || max_w == 0 || max_h == 0 {
        return ResizedDimensions {
            target_width: max_w,
            target_height: max_h,
            scale_factor_x: 1000,
            scale_factor_y: 1000,
        };
    }

    let scale_x = (max_w as f64) / (orig_w as f64);
    let scale_y = (max_h as f64) / (orig_h as f64);

    let scale = match mode {
        FitMode::Cover => scale_x.max(scale_y),
        FitMode::Contain => scale_x.min(scale_y),
    };

    let target_w = ((orig_w as f64) * scale).round() as u32;
    let target_h = ((orig_h as f64) * scale).round() as u32;

    ResizedDimensions {
        target_width: target_w,
        target_height: target_h,
        scale_factor_x: (scale_x * 1000.0).round() as u32,
        scale_factor_y: (scale_y * 1000.0).round() as u32,
    }
}

/// Complete Zero-GC memory guard scan of raw image upload bytes
pub fn scan_wallpaper_asset(data: &[u8]) -> WallpaperAssetScanResult {
    let meta: ImageMetadata = inspect_image_metadata(data);
    let checksum = sha256_hex(data);

    let is_4k = meta.width >= 3840 || meta.height >= 2160;

    let category = if meta.aspect_ratio.contains("Portrait") || meta.height > meta.width {
        "mobile".to_string()
    } else if is_4k {
        "ultra-hd".to_string()
    } else {
        "desktop".to_string()
    };

    WallpaperAssetScanResult {
        is_valid: meta.is_valid,
        format: meta.format,
        width: meta.width,
        height: meta.height,
        aspect_ratio: meta.aspect_ratio,
        resolution_label: meta.resolution_label,
        checksum_sha256: checksum,
        byte_size: data.len(),
        is_4k_or_higher: is_4k,
        recommended_category: category,
    }
}
