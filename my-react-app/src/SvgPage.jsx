import { useState, useEffect, useRef } from 'react';

function SvgPage() {
    const [shapes, setShapes] = useState([]);
    const [draggingShapeId, setDraggingShapeId] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
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

    const handleMouseDown = (e, shape) => {
        console.log("MouseDown on shape", shape.id);
        // Essential: prevent default to avoid selecting text/elements while dragging
        e.preventDefault();

        const svg = svgRef.current;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
        console.log("MouseDown coords (SVG):", svgP.x, svgP.y);

        setDraggingShapeId(shape.id);
        setDragOffset({
            x: svgP.x - shape.x,
            y: svgP.y - shape.y
        });
    };

    const handleMouseMove = (e) => {
        if (draggingShapeId === null) return;
        e.preventDefault();

        const svg = svgRef.current;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
        console.log("MouseMove dragging", draggingShapeId, "to", svgP.x, svgP.y);

        setShapes(prevShapes => prevShapes.map(s => {
            if (s.id === draggingShapeId) {
                return {
                    ...s,
                    x: svgP.x - dragOffset.x,
                    y: svgP.y - dragOffset.y
                };
            }
            return s;
        }));
    };

    const handleMouseUp = () => {
        setDraggingShapeId(null);
    };

    return (
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <h2>SVG Demo</h2>
            <p>Demonstrating vector-based rendering with <strong>interactive</strong> elements.</p>

            <svg
                ref={svgRef}
                width={canvasWidth}
                height={canvasHeight}
                style={{
                    border: '1px solid #ccc',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                    background: '#f0f0f0',
                    cursor: draggingShapeId !== null ? 'grabbing' : 'auto'
                }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {/* Draw lines first so they appear behind squares */}
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
                            style={{ pointerEvents: 'none' }} // Let clicks pass through lines
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
                        onMouseDown={(e) => handleMouseDown(e, shape)}
                        style={{
                            cursor: 'grab',
                            stroke: draggingShapeId === shape.id ? 'white' : 'none',
                            strokeWidth: 2
                        }}
                    />
                ))}
            </svg>
        </div>
    );
}

export default SvgPage;
