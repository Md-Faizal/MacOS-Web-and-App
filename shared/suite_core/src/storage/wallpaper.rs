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

// ─────────────────────────────────────────────────────────────────────────────
// Pure Rust Video Playback Watchdog & Smooth Transition Cadence Engine
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoPlaybackMetrics {
    pub current_time: f64,
    pub buffered_end: f64,
    pub duration: f64,
    pub playback_rate: f64,
    pub is_paused: bool,
    pub is_muted: bool,
    pub stall_count: u32,
    pub ready_state: u32,       // 0: HAVE_NOTHING, 1: HAVE_METADATA, 2: HAVE_CURRENT_DATA, 3: HAVE_FUTURE_DATA, 4: HAVE_ENOUGH_DATA
    pub network_state: u32,     // 0: EMPTY, 1: IDLE, 2: LOADING, 3: NO_SOURCE
    pub elapsed_stalled_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlaybackWatchdogEvaluation {
    pub health_status: String,        // "optimal", "buffering", "starving", "stalled", "frozen"
    pub recommended_action: String,   // "none", "resume", "buffer_wait", "soft_seek", "reload_source"
    pub buffer_headroom_secs: f64,
    pub should_recover: bool,
    pub recovery_delay_ms: u64,
    pub transition_fade_factor: f64,
}

/// Evaluates real-time HTML5 video playback health and dictates micro-recovery tactics
pub fn evaluate_video_playback(metrics: &VideoPlaybackMetrics) -> PlaybackWatchdogEvaluation {
    let headroom = if metrics.buffered_end > metrics.current_time {
        metrics.buffered_end - metrics.current_time
    } else {
        0.0
    };

    // Case 1: Video was paused unintentionally when tab is active and visible
    if metrics.is_paused && metrics.ready_state >= 2 {
        return PlaybackWatchdogEvaluation {
            health_status: "paused_unintentional".to_string(),
            recommended_action: "resume".to_string(),
            buffer_headroom_secs: headroom,
            should_recover: true,
            recovery_delay_ms: 150,
            transition_fade_factor: 1.0,
        };
    }

    // Case 2: Fatal or prolonged stall (> 4.5 seconds with no buffer progress)
    if metrics.elapsed_stalled_ms > 4500 || metrics.network_state == 3 {
        return PlaybackWatchdogEvaluation {
            health_status: "frozen".to_string(),
            recommended_action: "reload_source".to_string(),
            buffer_headroom_secs: headroom,
            should_recover: true,
            recovery_delay_ms: 500,
            transition_fade_factor: 0.0,
        };
    }

    // Case 3: Buffer starvation (headroom < 0.25s while running)
    if headroom < 0.25 && metrics.ready_state < 3 {
        return PlaybackWatchdogEvaluation {
            health_status: "starving".to_string(),
            recommended_action: "buffer_wait".to_string(),
            buffer_headroom_secs: headroom,
            should_recover: true,
            recovery_delay_ms: 400,
            transition_fade_factor: 0.8,
        };
    }

    // Case 4: Stalled transiently (ready state < 2 or stall count registered)
    if metrics.ready_state < 2 || metrics.elapsed_stalled_ms > 0 {
        return PlaybackWatchdogEvaluation {
            health_status: "stalled".to_string(),
            recommended_action: if metrics.stall_count > 3 { "soft_seek".to_string() } else { "resume".to_string() },
            buffer_headroom_secs: headroom,
            should_recover: true,
            recovery_delay_ms: 300,
            transition_fade_factor: 0.9,
        };
    }

    // Case 5: Optimal 60fps playback
    PlaybackWatchdogEvaluation {
        health_status: "optimal".to_string(),
        recommended_action: "none".to_string(),
        buffer_headroom_secs: headroom,
        should_recover: false,
        recovery_delay_ms: 0,
        transition_fade_factor: 1.0,
    }
}

/// Smooth cubic bezier ease-in-out interpolation for wallpaper cross-dissolve (Zero-GC)
pub fn calculate_smooth_fade_curve(progress: f64) -> f64 {
    let p = progress.clamp(0.0, 1.0);
    // Smooth Hermite S-curve: 3p^2 - 2p^3
    (p * p) * (3.0 - (2.0 * p))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_evaluate_video_playback_optimal() {
        let metrics = VideoPlaybackMetrics {
            current_time: 5.0,
            buffered_end: 15.0,
            duration: 30.0,
            playback_rate: 1.0,
            is_paused: false,
            is_muted: true,
            stall_count: 0,
            ready_state: 4,
            network_state: 1,
            elapsed_stalled_ms: 0,
        };
        let eval = evaluate_video_playback(&metrics);
        assert_eq!(eval.health_status, "optimal");
        assert_eq!(eval.recommended_action, "none");
        assert!(!eval.should_recover);
        assert_eq!(eval.buffer_headroom_secs, 10.0);
    }

    #[test]
    fn test_evaluate_video_playback_paused_recovery() {
        let metrics = VideoPlaybackMetrics {
            current_time: 5.0,
            buffered_end: 15.0,
            duration: 30.0,
            playback_rate: 1.0,
            is_paused: true,
            is_muted: true,
            stall_count: 1,
            ready_state: 4,
            network_state: 1,
            elapsed_stalled_ms: 0,
        };
        let eval = evaluate_video_playback(&metrics);
        assert_eq!(eval.health_status, "paused_unintentional");
        assert_eq!(eval.recommended_action, "resume");
        assert!(eval.should_recover);
    }

    #[test]
    fn test_smooth_fade_curve() {
        assert_eq!(calculate_smooth_fade_curve(0.0), 0.0);
        assert_eq!(calculate_smooth_fade_curve(0.5), 0.5);
        assert_eq!(calculate_smooth_fade_curve(1.0), 1.0);
    }
}

