import { useState, useEffect, useRef } from 'react';

function SvgPage() {
    const [shapes, setShapes] = useState([]);
    const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [draggingShapeId, setDraggingShapeId] = useState(null);
    const [isPanning, setIsPanning] = useState(false);

    // We store partial drag state in refs to avoid frequent re-renders or stale state closures in heavy events
    const dragStartRef = useRef({ x: 0, y: 0 }); // Mouse position at start of drag
    const initialTransformRef = useRef({ x: 0, y: 0 }); // View transform at start of pan
    const initialShapePosRef = useRef({ x: 0, y: 0 }); // Shape position at start of drag

    const svgRef = useRef(null);
    const canvasWidth = 600;
    const canvasHeight = 400;

    useEffect(() => {
        // Generate random shapes once on mount
        const newShapes = [];
        for (let i = 0; i < 10; i++) {
            const size = 30 + Math.random() * 20;
            const x = Math.random() * (canvasWidth - size);
            const y = Math.random() * (canvasHeight - size);
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
        // Transform screen point to SVG coordinate system (taking into account the viewTransform)
        // We manually apply the inverse of translate(x,y) scale(s)
        // pt_svg = (pt_screen - translate) / scale
        return {
            x: (pt.x - svg.getBoundingClientRect().left - viewTransform.x) / viewTransform.scale,
            y: (pt.y - svg.getBoundingClientRect().top - viewTransform.y) / viewTransform.scale
        };
    };

    const handleWheel = (e) => {
        e.preventDefault();
        const scaleAmount = -e.deltaY * 0.001;
        const newScale = Math.max(0.1, Math.min(viewTransform.scale * (1 + scaleAmount), 5));

        // precise zoom: keep the point under cursor stable
        // mouse position relative to SVG container
        const rect = svgRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Formula: newTranslate = mouse - (mouse - oldTranslate) * (newScale / oldScale)
        const scaleRatio = newScale / viewTransform.scale;
        const newX = mouseX - (mouseX - viewTransform.x) * scaleRatio;
        const newY = mouseY - (mouseY - viewTransform.y) * scaleRatio;

        setViewTransform({ x: newX, y: newY, scale: newScale });
    };

    const handleMouseDown = (e, shapeId = null) => {
        if (shapeId !== null) {
            // Dragging a SHAPE
            e.stopPropagation(); // prevent panning
            e.preventDefault();

            const pt = getSVGPoint(e.clientX, e.clientY);
            // find the shape to get its current pos
            const shape = shapes.find(s => s.id === shapeId);

            setDraggingShapeId(shapeId);
            dragStartRef.current = { x: pt.x, y: pt.y };
            initialShapePosRef.current = { x: shape.x, y: shape.y }; // Store original shape pos
        } else {
            // Panning the CANVAS
            e.preventDefault();
            setIsPanning(true);
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            initialTransformRef.current = { x: viewTransform.x, y: viewTransform.y };
        }
    };

    const handleMouseMove = (e) => {
        e.preventDefault();

        if (draggingShapeId !== null) {
            // Move Shape
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
            // Pan View
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
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <h2>SVG Infinite Canvas</h2>
            <p><strong>Pan</strong> (drag background) | <strong>Zoom</strong> (scroll) | <strong>Drag Rects</strong></p>

            <svg
                ref={svgRef}
                width={canvasWidth}
                height={canvasHeight}
                style={{
                    border: '1px solid #ccc',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                    background: '#f0f0f0',
                    cursor: isPanning ? 'grabbing' : 'grab',
                    overflow: 'hidden'
                }}
                onMouseDown={(e) => handleMouseDown(e, null)}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
            >
                {/* Apply Pan & Zoom Transform to the Group */}
                <g transform={`translate(${viewTransform.x}, ${viewTransform.y}) scale(${viewTransform.scale})`}>

                    {/* Grid Pattern Background (Optional, helps visualize movement) */}
                    <defs>
                        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#ddd" strokeWidth="1" />
                        </pattern>
                    </defs>
                    {/* Infinite grid illusion - make it huge */}
                    <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#grid)" />

                    {/* Draw lines */}
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

                    {/* Draw squares */}
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
                                strokeWidth: 2 / viewTransform.scale // Keep border thickness constant visually
                            }}
                        />
                    ))}
                </g>
            </svg>
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                Zoom: {Math.round(viewTransform.scale * 100)}% |
                X: {Math.round(viewTransform.x)} |
                Y: {Math.round(viewTransform.y)}
            </div>
        </div>
    );
}

export default SvgPage;
