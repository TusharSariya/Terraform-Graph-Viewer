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

    // Initial shape generation with Random Names
    const shapeNames = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa", "Lambda", "Mu"];

    useEffect(() => {
        const handleResize = () => {
            setDimensions({
                width: window.innerWidth,
                height: window.innerHeight - 60
            });
        };

        window.addEventListener('resize', handleResize);
        handleResize();

        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const newShapes = [];
        const bounds = { w: 2000, h: 2000 };

        for (let i = 0; i < 10; i++) {
            const size = 30 + Math.random() * 20;
            const x = Math.random() * (bounds.w / 2);
            const y = Math.random() * (bounds.h / 2);
            const color = `hsl(${Math.random() * 360}, 70%, 50%)`;
            const name = shapeNames[Math.floor(Math.random() * shapeNames.length)] + "-" + (i + 1);

            newShapes.push({
                id: i,
                x,
                y,
                size,
                color,
                name,
                showLabel: false // Default to hidden
            });
        }
        setShapes(newShapes);
    }, []);

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
        // Prevent strictly left-click drags if we want right-click for context menu
        // But usually dragging works on left click.
        if (e.button !== 0) return; // Only drag on left click

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

    const handleContextMenu = (e, shapeId) => {
        e.preventDefault(); // Stop native browser menu
        e.stopPropagation();

        setShapes(prevShapes => prevShapes.map(s => {
            if (s.id === shapeId) {
                return { ...s, showLabel: !s.showLabel };
            }
            return s;
        }));
    };

    return (
        <div style={{
            position: 'absolute',
            top: '60px',
            left: 0,
            width: '100%',
            height: 'calc(100vh - 60px)',
            overflow: 'hidden'
        }}>
            <div style={{
                position: 'absolute',
                top: 10,
                left: 10,
                background: 'rgba(255, 255, 255, 0.9)',
                padding: '10px',
                borderRadius: '8px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                zIndex: 100,
                pointerEvents: 'none'
            }}>
                <h3 style={{ margin: '0 0 5px 0' }}>SVG Infinite Canvas</h3>
                <div style={{ fontSize: '12px', color: '#666' }}>
                    Right-click box to show name<br />
                    Zoom: {Math.round(viewTransform.scale * 100)}%
                </div>
            </div>

            <svg
                ref={svgRef}
                width={dimensions.width}
                height={dimensions.height}
                style={{
                    background: '#f0f0f0',
                    cursor: isPanning ? 'grabbing' : 'grab',
                    display: 'block'
                }}
                onMouseDown={(e) => handleMouseDown(e, null)}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                onContextMenu={(e) => e.preventDefault()} // Disable default context menu on background
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
                        <g key={`group-${shape.id}`}>
                            <rect
                                x={shape.x}
                                y={shape.y}
                                width={shape.size}
                                height={shape.size}
                                fill={shape.color}
                                onMouseDown={(e) => handleMouseDown(e, shape.id)}
                                onContextMenu={(e) => handleContextMenu(e, shape.id)}
                                style={{
                                    cursor: 'move',
                                    stroke: draggingShapeId === shape.id ? 'white' : 'none',
                                    strokeWidth: 2 / viewTransform.scale
                                }}
                            />
                            {shape.showLabel && (
                                <text
                                    x={shape.x + shape.size + 5}
                                    y={shape.y + shape.size / 2}
                                    dominantBaseline="middle"
                                    fill="#333"
                                    fontSize={14}
                                    style={{
                                        pointerEvents: 'none',
                                        userSelect: 'none',
                                        textShadow: '0px 0px 2px white'
                                    }}
                                >
                                    {shape.name}
                                </text>
                            )}
                        </g>
                    ))}
                </g>
            </svg>
        </div>
    );
}

export default SvgPage;
