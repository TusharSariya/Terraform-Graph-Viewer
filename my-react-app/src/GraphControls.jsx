import React from 'react';

const GraphControls = ({ mode, setMode, zoomScale }) => {
    return (
        <div style={{
            position: 'absolute',
            top: 10,
            left: 10,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            zIndex: 100
        }}>
            <div style={{
                background: 'rgba(255, 255, 255, 0.9)',
                padding: '10px',
                borderRadius: '8px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                pointerEvents: 'none'
            }}>
                <h3 style={{ margin: '0 0 5px 0' }}>SVG Infinite Canvas</h3>
                <div style={{ fontSize: '12px', color: '#666' }}>
                    Right-click box to show name<br />
                    Zoom: {Math.round(zoomScale * 100)}%
                </div>
            </div>

            {/* Toolbar */}
            <div style={{
                background: 'white',
                padding: '5px',
                borderRadius: '8px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                display: 'flex',
                gap: '5px',
                pointerEvents: 'auto'
            }}>
                <button
                    onClick={() => setMode('pan')}
                    style={{
                        background: mode === 'pan' ? '#e0efff' : 'transparent',
                        border: mode === 'pan' ? '1px solid #1a73e8' : '1px solid transparent',
                        cursor: 'pointer',
                        padding: '5px 10px',
                        borderRadius: '4px'
                    }}
                >
                    ✋ Pan
                </button>
                <button
                    onClick={() => setMode('draw')}
                    style={{
                        background: mode === 'draw' ? '#e0efff' : 'transparent',
                        border: mode === 'draw' ? '1px solid #1a73e8' : '1px solid transparent',
                        cursor: 'pointer',
                        padding: '5px 10px',
                        borderRadius: '4px'
                    }}
                >
                    ✏️ Draw
                </button>
                <button
                    onClick={() => setMode('eraser')}
                    style={{
                        background: mode === 'eraser' ? '#e0efff' : 'transparent',
                        border: mode === 'eraser' ? '1px solid #1a73e8' : '1px solid transparent',
                        cursor: 'pointer',
                        padding: '5px 10px',
                        borderRadius: '4px'
                    }}
                >
                    🧹 Eraser
                </button>
            </div>
        </div>
    );
};

export default GraphControls;
