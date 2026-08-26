/**
 * Wallpaper Control Component
 * 
 * React component for the Settings App wallpaper section
 * Features:
 * - Real-time wallpaper preview grid
 * - Variant selection (Auto, Light, Dark)
 * - Transition effect selection
 * - Loop and playback speed controls
 * - Recently used wallpapers
 * - Add new wallpaper modal
 * 
 * Usage:
 * <WallpaperControl />
 */

import React, { useState, useEffect, useRef } from 'react';

class WallpaperControl extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      // Wallpaper list
      wallpapers: [],
      selectedWallpaper: null,
      loading: true,
      error: null,

      // UI states
      variant: 'auto', // auto, light, dark
      transitionType: 'fade', // fade, frost, dissolve
      transitionDuration: 600,
      loopEnabled: true,
      playbackSpeed: 1.0,

      // Recently used
      recentlyUsed: [],

      // Download progress
      downloadProgress: null,
      downloadingWallpaperId: null,

      // Modal states
      showAddModal: false,
      showSettings: false,
      previewTransition: null
    };

    this.downloadManager = props.downloadManager;
    this.cacheManager = props.cacheManager;
    this.transitionManager = props.transitionManager;
  }

  async componentDidMount() {
    await this.loadWallpapers();
    await this.loadRecentlyUsed();
    this.setupEventListeners();
  }

  /**
   * Load all available wallpapers from API
   */
  loadWallpapers = async () => {
    try {
      this.setState({ loading: true, error: null });

      const response = await fetch('/api/wallpapers');
      const data = await response.json();

      if (data.success) {
        console.log(`[WallpaperControl] Loaded ${data.count} wallpapers`);
        this.setState({
          wallpapers: data.wallpapers,
          selectedWallpaper: data.wallpapers[0] || null,
          loading: false
        });
      } else {
        throw new Error(data.error || 'Failed to load wallpapers');
      }
    } catch (error) {
      console.error('[WallpaperControl] Load error:', error);
      this.setState({ error: error.message, loading: false });
    }
  };

  /**
   * Load recently used wallpapers from cache
   */
  loadRecentlyUsed = async () => {
    try {
      const history = await this.cacheManager.getHistory();
      const recentlyUsed = [];

      for (const entry of history) {
        const wallpaper = this.state.wallpapers.find(w => w.id === entry.wallpaperId);
        if (wallpaper) {
          recentlyUsed.push({
            ...wallpaper,
            lastUsed: entry.timestamp,
            variant: entry.variant
          });
        }
      }

      this.setState({ recentlyUsed });
    } catch (error) {
      console.warn('[WallpaperControl] Error loading recently used:', error);
    }
  };

  /**
   * Setup event listeners for download progress
   */
  setupEventListeners = () => {
    if (!this.downloadManager) return;

    this.downloadManager.on('download-progress', ({ progress, wallpaperId }) => {
      this.setState({
        downloadProgress: progress,
        downloadingWallpaperId: wallpaperId
      });
    });

    this.downloadManager.on('download-complete', ({ wallpaperId }) => {
      console.log('[WallpaperControl] Download complete:', wallpaperId);
      this.setState({ downloadProgress: null });
    });

    this.downloadManager.on('wallpaper-applied', () => {
      this.loadRecentlyUsed();
    });
  };

  /**
   * Handle wallpaper selection and download
   */
  selectWallpaper = async (wallpaper) => {
    console.log('[WallpaperControl] Selecting wallpaper:', wallpaper.name);

    this.setState({
      selectedWallpaper: wallpaper,
      downloadingWallpaperId: wallpaper.id,
      downloadProgress: 0
    });

    try {
      // Start background download and apply
      const success = await this.downloadManager.downloadAndApply(wallpaper, {
        variant: this.state.variant,
        transitionType: this.state.transitionType,
        transitionDuration: this.state.transitionDuration,
        onProgress: (data) => {
          this.setState({ downloadProgress: data.progress });
        },
        onReady: (data) => {
          console.log('[WallpaperControl] Download ready, can show preview if needed');
        },
        onApplied: (data) => {
          console.log('[WallpaperControl] Wallpaper applied');
          this.setState({ downloadProgress: null, downloadingWallpaperId: null });
        }
      });

      if (!success) {
        this.setState({
          error: 'Failed to apply wallpaper. Please try again.',
          downloadProgress: null,
          downloadingWallpaperId: null
        });
      }
    } catch (error) {
      console.error('[WallpaperControl] Selection error:', error);
      this.setState({
        error: error.message,
        downloadProgress: null,
        downloadingWallpaperId: null
      });
    }
  };

  /**
   * Handle variant selection (Light/Dark/Auto)
   */
  selectVariant = (variant) => {
    console.log('[WallpaperControl] Variant changed to:', variant);
    this.setState({ variant });

    // Re-apply current wallpaper with new variant
    if (this.state.selectedWallpaper) {
      this.selectWallpaper(this.state.selectedWallpaper);
    }
  };

  /**
   * Handle transition type change
   */
  selectTransition = (transitionType) => {
    console.log('[WallpaperControl] Transition changed to:', transitionType);
    this.setState({ transitionType });
  };

  /**
   * Preview transition effect
   */
  previewTransition = async (transitionType) => {
    if (!this.transitionManager) return;

    this.setState({ previewTransition: transitionType });
    await this.transitionManager.previewTransition(transitionType, 400);
    this.setState({ previewTransition: null });
  };

  /**
   * Handle loop toggle
   */
  toggleLoop = (enabled) => {
    this.setState({ loopEnabled: enabled });
    this.updateWallpaperSettings({ loopEnabled: enabled });
  };

  /**
   * Handle playback speed change
   */
  setPlaybackSpeed = (speed) => {
    this.setState({ playbackSpeed: speed });
    this.updateWallpaperSettings({ playbackSpeed: speed });
  };

  /**
   * Update wallpaper settings
   */
  updateWallpaperSettings = async (settings) => {
    if (!this.state.selectedWallpaper) return;

    const metadata = await this.cacheManager.getMetadata(this.state.selectedWallpaper.id);
    if (metadata) {
      await this.cacheManager.storeMetadata({
        ...metadata,
        ...settings
      });
    }
  };

  /**
   * Get cache stats for selected wallpaper
   */
  getCacheStats = async () => {
    const stats = await this.cacheManager.getStats();
    return stats;
  };

  render() {
    const {
      wallpapers,
      selectedWallpaper,
      loading,
      error,
      variant,
      transitionType,
      transitionDuration,
      loopEnabled,
      playbackSpeed,
      recentlyUsed,
      downloadProgress,
      downloadingWallpaperId,
      showAddModal,
      showSettings,
      previewTransition
    } = this.state;

    return (
      <div className="wallpaper-control">
        <style>{`
          .wallpaper-control {
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }

          .wallpaper-section {
            margin-bottom: 30px;
          }

          .section-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 15px;
            color: #333;
          }

          .wallpaper-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
            gap: 12px;
            margin-bottom: 20px;
          }

          .wallpaper-tile {
            position: relative;
            width: 100%;
            aspect-ratio: 16 / 10;
            border-radius: 8px;
            overflow: hidden;
            cursor: pointer;
            border: 3px solid transparent;
            transition: all 0.3s ease;
            background: #f0f0f0;
          }

          .wallpaper-tile:hover {
            transform: scale(1.05);
            border-color: #0071e3;
          }

          .wallpaper-tile.selected {
            border-color: #0071e3;
            box-shadow: 0 0 0 2px white, 0 0 0 4px #0071e3;
          }

          .wallpaper-tile-preview {
            width: 100%;
            height: 100%;
            object-fit: cover;
            background: #ddd;
          }

          .wallpaper-tile-overlay {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            background: linear-gradient(to top, rgba(0,0,0,0.5), transparent);
            padding: 8px;
            color: white;
            font-size: 12px;
            font-weight: 500;
          }

          .wallpaper-tile-loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 24px;
            height: 24px;
            border: 2px solid #0071e3;
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 0.6s linear infinite;
          }

          @keyframes spin {
            to { transform: translate(-50%, -50%) rotate(360deg); }
          }

          .controls-section {
            background: #f5f5f5;
            padding: 16px;
            border-radius: 8px;
            margin-bottom: 20px;
          }

          .control-group {
            margin-bottom: 16px;
          }

          .control-group:last-child {
            margin-bottom: 0;
          }

          .control-label {
            display: block;
            font-size: 13px;
            font-weight: 500;
            margin-bottom: 8px;
            color: #555;
          }

          .control-options {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }

          .option-button {
            padding: 8px 16px;
            border: 1px solid #ccc;
            border-radius: 6px;
            background: white;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s ease;
          }

          .option-button:hover {
            border-color: #0071e3;
            color: #0071e3;
          }

          .option-button.active {
            background: #0071e3;
            color: white;
            border-color: #0071e3;
          }

          .slider-group {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .slider-group input[type="range"] {
            flex: 1;
          }

          .slider-value {
            min-width: 50px;
            text-align: right;
            font-size: 13px;
            color: #666;
          }

          .error-message {
            background: #fee;
            color: #c33;
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 16px;
            font-size: 13px;
          }

          .button {
            padding: 10px 16px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s ease;
          }

          .button-primary {
            background: #0071e3;
            color: white;
          }

          .button-primary:hover {
            background: #0a66d2;
          }

          .button-secondary {
            background: #f0f0f0;
            color: #333;
            border: 1px solid #ccc;
          }

          .button-secondary:hover {
            background: #e8e8e8;
          }

          .stats-display {
            background: #f0f0f0;
            padding: 12px;
            border-radius: 6px;
            font-size: 12px;
            color: #666;
            margin-top: 12px;
          }

          .preview-text {
            text-align: center;
            color: #0071e3;
            font-size: 13px;
            margin-top: 8px;
          }
        `}</style>

        {/* Wallpaper Selection */}
        <div className="wallpaper-section">
          <div className="section-title">Wallpapers</div>

          {error && <div className="error-message">{error}</div>}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div className="wallpaper-tile-loading" style={{ margin: '0 auto' }}></div>
            </div>
          ) : (
            <>
              <div className="wallpaper-grid">
                {wallpapers.map(wallpaper => (
                  <div
                    key={wallpaper.id}
                    className={`wallpaper-tile ${selectedWallpaper?.id === wallpaper.id ? 'selected' : ''} ${
                      downloadingWallpaperId === wallpaper.id ? 'loading' : ''
                    }`}
                    onClick={() => this.selectWallpaper(wallpaper)}
                    title={wallpaper.name}
                  >
                    {/* Render actual wallpaper preview - not thumbnail */}
                    {wallpaper.type === 'dynamic' ? (
                      <video
                        src={wallpaper.path}
                        className="wallpaper-tile-preview"
                        autoPlay
                        muted
                        loop
                        onMouseEnter={(e) => e.target.play()}
                        onMouseLeave={(e) => e.target.pause()}
                      />
                    ) : (
                      <img
                        src={wallpaper.path}
                        alt={wallpaper.name}
                        className="wallpaper-tile-preview"
                      />
                    )}

                    {downloadingWallpaperId === wallpaper.id && (
                      <>
                        <div className="wallpaper-tile-loading"></div>
                        {downloadProgress !== null && (
                          <div
                            className="wallpaper-tile-overlay"
                            style={{ background: `linear-gradient(to top, rgba(0,0,0,${downloadProgress / 100 * 0.5}), transparent)` }}
                          >
                            {Math.round(downloadProgress)}%
                          </div>
                        )}
                      </>
                    )}

                    <div className="wallpaper-tile-overlay" style={{ opacity: 0.8 }}>
                      {wallpaper.name}
                    </div>
                  </div>
                ))}
              </div>

              {/* Recently Used */}
              {recentlyUsed.length > 0 && (
                <div style={{ marginTop: '24px' }}>
                  <div className="section-title">Recently Used</div>
                  <div className="wallpaper-grid">
                    {recentlyUsed.map(wallpaper => (
                      <div
                        key={wallpaper.id}
                        className="wallpaper-tile"
                        onClick={() => this.selectWallpaper(wallpaper)}
                        title={wallpaper.name}
                      >
                        {wallpaper.type === 'dynamic' ? (
                          <video src={wallpaper.path} className="wallpaper-tile-preview" />
                        ) : (
                          <img src={wallpaper.path} alt={wallpaper.name} className="wallpaper-tile-preview" />
                        )}
                        <div className="wallpaper-tile-overlay" style={{ opacity: 0.8 }}>
                          {wallpaper.name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Variant Selection */}
        {selectedWallpaper && (
          <div className="wallpaper-section">
            <div className="controls-section">
              <div className="control-group">
                <label className="control-label">Appearance</label>
                <div className="control-options">
                  {['auto', 'light', 'dark'].map(v => (
                    <button
                      key={v}
                      className={`option-button ${variant === v ? 'active' : ''}`}
                      onClick={() => this.selectVariant(v)}
                    >
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Transition Selection */}
        {selectedWallpaper && (
          <div className="wallpaper-section">
            <div className="controls-section">
              <div className="control-group">
                <label className="control-label">Transition Effect</label>
                <div className="control-options">
                  {['fade', 'frost', 'dissolve'].map(t => (
                    <button
                      key={t}
                      className={`option-button ${transitionType === t ? 'active' : ''}`}
                      onClick={() => this.selectTransition(t)}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: '12px' }}>
                <button
                  className="button button-secondary"
                  onClick={() => this.previewTransition(transitionType)}
                  disabled={previewTransition !== null}
                >
                  {previewTransition ? 'Previewing...' : 'Preview Transition'}
                </button>
              </div>

              <div className="control-group">
                <label className="control-label">Transition Duration</label>
                <div className="slider-group">
                  <input
                    type="range"
                    min="300"
                    max="2000"
                    step="100"
                    value={transitionDuration}
                    onChange={(e) => this.setState({ transitionDuration: parseInt(e.target.value) })}
                  />
                  <span className="slider-value">{transitionDuration}ms</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Wallpaper Controls */}
        {selectedWallpaper?.type === 'dynamic' && (
          <div className="wallpaper-section">
            <div className="controls-section">
              <div className="control-group">
                <label className="control-label">
                  <input
                    type="checkbox"
                    checked={loopEnabled}
                    onChange={(e) => this.toggleLoop(e.target.checked)}
                    style={{ marginRight: '8px' }}
                  />
                  Loop Video
                </label>
              </div>

              <div className="control-group">
                <label className="control-label">Playback Speed</label>
                <div className="slider-group">
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={playbackSpeed}
                    onChange={(e) => this.setPlaybackSpeed(parseFloat(e.target.value))}
                  />
                  <span className="slider-value">{playbackSpeed.toFixed(1)}x</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Wallpaper Button */}
        <div className="wallpaper-section">
          <button
            className="button button-primary"
            onClick={() => this.setState({ showAddModal: true })}
          >
            + Add Custom Wallpaper
          </button>
        </div>

        {/* Cache Stats */}
        <div className="wallpaper-section">
          <div className="stats-display">
            Cache Statistics:
            <div style={{ marginTop: '8px' }}>
              <span id="cache-stats">Loading...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default WallpaperControl;
