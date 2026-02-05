import React, { useRef } from 'react';

const ContextMenu = ({ x, y, onClose, items, children, embedded, onMouseDown }) => {
    const mouseDownPos = useRef({ x: 0, y: 0 });

    const handleMouseDownWrapper = (e) => {
        mouseDownPos.current = { x: e.clientX, y: e.clientY };
        if (onMouseDown) onMouseDown(e);
    };

    return (
        <div
            onMouseDown={handleMouseDownWrapper}
            style={{
                position: embedded ? 'static' : 'fixed',
                top: embedded ? undefined : y,
                left: embedded ? undefined : x,
                backgroundColor: 'white',
                border: '1px solid #ccc',
                boxShadow: '2px 2px 5px rgba(0,0,0,0.2)',
                zIndex: 1000,
                padding: '5px 0',
                borderRadius: '4px',
                minWidth: '150px'
            }}
            onContextMenu={(e) => {
                e.preventDefault();
                onClose();
            }}
        >
            {items ? items.map((item, index) => (
                <div
                    key={index}
                    style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        color: '#333',
                        borderBottom: index < items.length - 1 ? '1px solid #eee' : 'none'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#f5f5f5'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'white'}
                    onClick={(e) => {
                        e.stopPropagation();
                        // Check for drag
                        const dx = Math.abs(e.clientX - mouseDownPos.current.x);
                        const dy = Math.abs(e.clientY - mouseDownPos.current.y);
                        if (dx > 5 || dy > 5) return; // It was a drag, not a click

                        if (item.onClick) item.onClick();
                        if (onClose) onClose();
                    }}
                >
                    {item.label}
                </div>
            )) : children}
        </div>
    );
};

export default ContextMenu;
