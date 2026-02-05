import React, { useRef, useState } from 'react';

const ContextMenu = ({ x, y, onClose, items, children, embedded, onMouseDown }) => {
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
                position: embedded ? 'static' : 'fixed',
                top: embedded ? undefined : y,
                left: embedded ? undefined : x,
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
                // Do not close on right click inside, just prevent default
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
                        // If it has subItems, click might toggle it or do nothing (hover handles it)
                        // Standard behavior: leaf nodes trigger action and close menu.
                        // Branch nodes (submenus) just show menu.
                        if (!item.subItems && !item.disabled) {
                            // Only close if it's a leaf node action? 
                            // Usually yes, but if we want to keep it open we can.
                            // For now, let's assume if there's an onClick, we might want to close?
                            // But the parent handles close. The onClick should probably call onClose provided by parent if desired.
                            // Actually, the original implementation didn't strictly enforce close on click inside component,
                            // but the usage in SvgPage did: `() => { ...; handleCloseContextMenu() }`.
                            // So we rely on the item.onClick to close if it wants to.
                        }
                    }}
                >
                    <span>{item.label}</span>
                    {item.subItems && <span>&#9656;</span>}

                    {/* Render SubMenu */}
                    {item.subItems && activeSubMenuIndex === index && (
                        <ContextMenu
                            embedded={false} // Force fixed position relative to screen or calculate absolute?
                            // Actually, since we are inside a relative parent, absolute positioning works nice.
                            // But wait, the top-level ContextMenu in SvgPage is inside a foreignObject.
                            // Basic absolute positioning `left: 100%` might work if overflow is visible.
                            x={'100%'}
                            y={0}
                            items={item.subItems}
                            onClose={onClose}
                        // Propagate common props?
                        // For recursive menus, they are just visual extensions.
                        // We construct them to look like they are popping out.
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
