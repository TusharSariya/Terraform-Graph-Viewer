import { useState, useEffect } from 'react';

function SvgPage() {
    const [shapes, setShapes] = useState([]);
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
                color,
                centerX: x + size / 2,
                centerY: y + size / 2
            });
        }
        setShapes(newShapes);
    }, []);

    return (
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <h2>SVG Demo</h2>
            <p>Demonstrating vector-based rendering with declaritive elements.</p>

            <svg
                width={canvasWidth}
                height={canvasHeight}
                style={{ border: '1px solid #ccc', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', background: '#f0f0f0' }}
            >
                {/* Draw lines first so they appear behind squares */}
                {shapes.map((shape, i) => {
                    if (i === shapes.length - 1) return null;
                    const nextShape = shapes[i + 1];
                    return (
                        <line
                            key={`line-${i}`}
                            x1={shape.centerX}
                            y1={shape.centerY}
                            x2={nextShape.centerX}
                            y2={nextShape.centerY}
                            stroke="#333"
                            strokeWidth="2"
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
                    />
                ))}
            </svg>
        </div>
    );
}

export default SvgPage;
