import { useState, useEffect, useRef } from 'react';

function SvgPage() {
    const [shapes, setShapes] = useState([]);
    const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [draggingShapeId, setDraggingShapeId] = useState(null);
    const [isPanning, setIsPanning] = useState(false);
    const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

    const dragStartRef = useRef({ x: 0, y: 0 });
    const initialTransformRef = useRef({ x: 0, y: 0 });
    const initialShapePosRef = useRef({ x: 0, y: 0 });

    const svgRef = useRef(null);

    // Handle Resize
    useEffect(() => {
        const handleResize = () => {
            // Subtract navbar height roughly (or exact if we knew it)
            // For true fullscreen, we might want to overlay nav, but for now let's fill 'rest of screen'
            // We'll use window dimensions but subtract a bit for the top nav if it's there.
            // Actually, let's just make it full viewport and let the nav sit on top or push it down.
            // Since App.jsx currently puts nav in normal flow, we should probably account for it, 
            // OR just switch to full viewport calculation.
            setDimensions({
                width: window.innerWidth,
                height: window.innerHeight - 60 // Approximate nav height
            });
        };

        window.addEventListener('resize', handleResize);
        handleResize(); // Initial size

        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        // Generate random shapes once on mount
        const newShapes = [];
        // Use initial dimensions for bounds, or larger since it's infinite
        const bounds = { w: 2000, h: 2000 };

        for (let i = 0; i < 10; i++) {
            const size = 30 + Math.random() * 20;
            // Spread them out a bit more
            const x = Math.random() * (bounds.w / 2);
            const y = Math.random() * (bounds.h / 2);
            const color = `hsl(${Math.random() * 360}, 70%, 50%)`;

            newShapes.push({
                id: i,
                x,
                y,
                size,
                color
            });
        }
        setShapes(newShapes);
    }, []);

    // SCREEN to SVG COORDINATES helper
    const getSVGPoint = (clientX, clientY) => {
        const svg = svgRef.current;
        const pt = svg.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        return {
            x: (pt.x - svg.getBoundingClientRect().left - viewTransform.x) / viewTransform.scale,
            y: (pt.y - svg.getBoundingClientRect().top - viewTransform.y) / viewTransform.scale
        };
    };

    const handleWheel = (e) => {
        e.preventDefault();
        const scaleAmount = -e.deltaY * 0.001;
        const newScale = Math.max(0.1, Math.min(viewTransform.scale * (1 + scaleAmount), 5));

        const rect = svgRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const scaleRatio = newScale / viewTransform.scale;
        const newX = mouseX - (mouseX - viewTransform.x) * scaleRatio;
        const newY = mouseY - (mouseY - viewTransform.y) * scaleRatio;

        setViewTransform({ x: newX, y: newY, scale: newScale });
    };

    const handleMouseDown = (e, shapeId = null) => {
        if (shapeId !== null) {
            e.stopPropagation();
            e.preventDefault();
            const pt = getSVGPoint(e.clientX, e.clientY);
            const shape = shapes.find(s => s.id === shapeId);
            setDraggingShapeId(shapeId);
            dragStartRef.current = { x: pt.x, y: pt.y };
            initialShapePosRef.current = { x: shape.x, y: shape.y };
        } else {
            e.preventDefault();
            setIsPanning(true);
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            initialTransformRef.current = { x: viewTransform.x, y: viewTransform.y };
        }
    };

    const handleMouseMove = (e) => {
        e.preventDefault();

        if (draggingShapeId !== null) {
            const pt = getSVGPoint(e.clientX, e.clientY);
            const dx = pt.x - dragStartRef.current.x;
            const dy = pt.y - dragStartRef.current.y;

            setShapes(prevShapes => prevShapes.map(s => {
                if (s.id === draggingShapeId) {
                    return {
                        ...s,
                        x: initialShapePosRef.current.x + dx,
                        y: initialShapePosRef.current.y + dy
                    };
                }
                return s;
            }));

        } else if (isPanning) {
            const dx = e.clientX - dragStartRef.current.x;
            const dy = e.clientY - dragStartRef.current.y;

            setViewTransform({
                ...viewTransform,
                x: initialTransformRef.current.x + dx,
                y: initialTransformRef.current.y + dy
            });
        }
    };

    const handleMouseUp = () => {
        setDraggingShapeId(null);
        setIsPanning(false);
    };

    return (
        <div style={{
            position: 'absolute',
            top: '60px', // Below nav
            left: 0,
            width: '100%',
            height: 'calc(100vh - 60px)',
            overflow: 'hidden'
        }}>

            {/* Control Panel Overlay */}
            <div style={{
                position: 'absolute',
                top: 10,
                left: 10,
                background: 'rgba(255, 255, 255, 0.9)',
                padding: '10px',
                borderRadius: '8px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                zIndex: 100,
                pointerEvents: 'none' // Let clicks pass through if needed, but usually we want controls clickable.
                // Actually, text shouldn't block, but buttons would. 
                // For this simple text, pointerEvents none is fine.
            }}>
                <h3 style={{ margin: '0 0 5px 0' }}>SVG Infinite Canvas</h3>
                <div style={{ fontSize: '12px', color: '#666' }}>
                    Zoom: {Math.round(viewTransform.scale * 100)}% <br />
                    X: {Math.round(viewTransform.x)} Y: {Math.round(viewTransform.y)}
                </div>
            </div>

            <svg
                ref={svgRef}
                width={dimensions.width}
                height={dimensions.height}
                style={{
                    background: '#f0f0f0',
                    cursor: isPanning ? 'grabbing' : 'grab',
                    display: 'block' // Remove inline-block spacing
                }}
                onMouseDown={(e) => handleMouseDown(e, null)}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
            >
                <g transform={`translate(${viewTransform.x}, ${viewTransform.y}) scale(${viewTransform.scale})`}>
                    <defs>
                        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e0e0e0" strokeWidth="1" />
                        </pattern>
                    </defs>
                    <rect x="-50000" y="-50000" width="100000" height="100000" fill="url(#grid)" />

                    {shapes.map((shape, i) => {
                        if (i === shapes.length - 1) return null;
                        const nextShape = shapes[i + 1];
                        return (
                            <line
                                key={`line-${i}`}
                                x1={shape.x + shape.size / 2}
                                y1={shape.y + shape.size / 2}
                                x2={nextShape.x + nextShape.size / 2}
                                y2={nextShape.y + nextShape.size / 2}
                                stroke="#333"
                                strokeWidth="2"
                                style={{ pointerEvents: 'none' }}
                            />
                        );
                    })}

                    {shapes.map((shape) => (
                        <rect
                            key={`rect-${shape.id}`}
                            x={shape.x}
                            y={shape.y}
                            width={shape.size}
                            height={shape.size}
                            fill={shape.color}
                            onMouseDown={(e) => handleMouseDown(e, shape.id)}
                            style={{
                                cursor: 'move',
                                stroke: draggingShapeId === shape.id ? 'white' : 'none',
                                strokeWidth: 2 / viewTransform.scale
                            }}
                        />
                    ))}
                </g>
            </svg>
        </div>
    );
}

export default SvgPage;
