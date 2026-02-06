import React, { useRef, useState } from 'react';

const ContextMenu = ({ x, y, onClose, items, children, embedded, submenu, onMouseDown }) => {
    const mouseDownPos = useRef({ x: 0, y: 0 });
    const [activeSubMenuIndex, setActiveSubMenuIndex] = useState(null);

    const handleMouseDownWrapper = (e) => {
        mouseDownPos.current = { x: e.clientX, y: e.clientY };
        if (onMouseDown) onMouseDown(e);
    };

    return (
        <div
            onMouseDown={handleMouseDownWrapper}
            style={{
                position: submenu ? 'absolute' : (embedded ? 'static' : 'fixed'),
                top: submenu ? 0 : (embedded ? undefined : y),
                left: submenu ? 'calc(100% + 2px)' : (embedded ? undefined : x),
                backgroundColor: 'white',
                border: '1px solid #ccc',
                boxShadow: '2px 2px 5px rgba(0,0,0,0.2)',
                zIndex: 1000,
                padding: '5px 0',
                borderRadius: '4px',
                minWidth: '150px',
                display: 'flex',
                flexDirection: 'column'
            }}
            onContextMenu={(e) => {
                e.preventDefault();
                onClose()
            }}
            onMouseLeave={() => setActiveSubMenuIndex(null)}
        >
            {items ? items.map((item, index) => (
                <div
                    key={index}
                    style={{
                        padding: '8px 12px',
                        cursor: item.disabled ? 'default' : 'pointer',
                        fontSize: '14px',
                        color: item.disabled ? '#999' : '#333',
                        borderBottom: index < items.length - 1 ? '1px solid #eee' : 'none',
                        position: 'relative',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: activeSubMenuIndex === index ? '#f5f5f5' : 'white'
                    }}
                    onMouseEnter={(e) => {
                        if (!item.disabled) {
                            setActiveSubMenuIndex(index);
                            e.currentTarget.style.backgroundColor = '#f5f5f5';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (activeSubMenuIndex !== index) {
                            e.currentTarget.style.backgroundColor = 'white';
                        }
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        // Check for drag
                        const dx = Math.abs(e.clientX - mouseDownPos.current.x);
                        const dy = Math.abs(e.clientY - mouseDownPos.current.y);
                        if (dx > 5 || dy > 5) return; // It was a drag, not a click

                        if (item.disabled) return;

                        if (item.onClick) {
                            item.onClick();
                        }
                    }}
                >
                    <span>{item.label}</span>
                    {item.subItems && <span>&#9656;</span>}

                    {/* Render SubMenu - positioned to the right of parent item */}
                    {item.subItems && activeSubMenuIndex === index && (
                        <ContextMenu
                            submenu={true}
                            items={item.subItems}
                            onClose={onClose}
                            onMouseDown={onMouseDown}
                        />
                    )}
                </div>
            )) : children}
            {/* Override styles for recursive instance to position correctly */}
            {items && items.some((i, idx) => i.subItems && activeSubMenuIndex === idx) && (
                <style>{`
                    /* specific tweaks if needed */
                 `}</style>
            )}
        </div>
    );
};

export default ContextMenu;
