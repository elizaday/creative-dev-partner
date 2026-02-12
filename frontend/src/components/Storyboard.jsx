export default function Storyboard({ frames }) {
  if (!frames || frames.length === 0) return null;

  return (
    <div className="storyboard-container">
      <div className="storyboard-header">
        <h4>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
            <rect x="9" y="1" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
            <rect x="1" y="9" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
            <rect x="9" y="9" width="6" height="6" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          Storyboard Frames
        </h4>
        <span className="frame-count">{frames.length} frames • ~30 seconds</span>
      </div>

      <div className="storyboard-grid">
        {frames.map((frame, index) => (
          <div key={index} className="storyboard-frame" data-frame={frame.frameNumber}>
            <div className="frame-image-placeholder">
              <div className="frame-overlay">
                <span className="shot-type-badge">{frame.shotType}</span>
                <span className="timing-badge">{frame.timing}</span>
              </div>

              {frame.imageUrl ? (
                <img
                  src={frame.imageUrl}
                  alt={`Frame ${frame.frameNumber}`}
                  className="frame-image"
                  loading="lazy"
                />
              ) : (
                <div className="frame-visual-desc">
                  <div className="camera-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="2" y="6" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                      <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M22 8L22 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <p className="visual-text">{frame.visual}</p>
                </div>
              )}
            </div>

            <div className="frame-details">
              <div className="frame-number-header">
                <span className="frame-num">Frame {frame.frameNumber}</span>
                <span className="frame-timing">{frame.timing}</span>
              </div>

              <div className="frame-info-section">
                <div className="info-label">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M8 8L8 12M8 5L8 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Visual
                </div>
                <p className="info-content">{frame.visual}</p>
              </div>

              <div className="frame-info-section">
                <div className="info-label">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M5 3L11 8L5 13V3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                  Action
                </div>
                <p className="info-content">{frame.action}</p>
              </div>

              <div className="frame-info-section">
                <div className="info-label">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M3 5C3 3.89543 3.89543 3 5 3H6C7.10457 3 8 3.89543 8 5V11C8 12.1046 7.10457 13 6 13H5C3.89543 13 3 12.1046 3 11V5Z" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M8 5C8 3.89543 8.89543 3 10 3H11C12.1046 3 13 3.89543 13 5V11C13 12.1046 12.1046 13 11 13H10C8.89543 13 8 12.1046 8 11V5Z" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                  Audio
                </div>
                <p className="info-content audio-content">{frame.audio}</p>
              </div>

              {frame.transition && (
                <div className="frame-transition">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M2 8H14M14 8L10 4M14 8L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {frame.transition}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
