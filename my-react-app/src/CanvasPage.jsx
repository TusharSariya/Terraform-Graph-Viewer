import { useEffect, useRef, useState } from 'react';

function CanvasPage() {
    const canvasRef = useRef(null);
    const [shapes, setShapes] = useState([]);
    const [draggingShapeId, setDraggingShapeId] = useState(null);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    // Initialize shapes on mount
    useEffect(() => {
        const initialShapes = [];
        const canvasWidth = 600;
        const canvasHeight = 400;

        for (let i = 0; i < 10; i++) {
            const size = 30 + Math.random() * 20;
            const x = Math.random() * (canvasWidth - size);
            const y = Math.random() * (canvasHeight - size);
            const color = `hsl(${Math.random() * 360}, 70%, 50%)`;

            initialShapes.push({ id: i, x, y, size, color });
        }
        setShapes(initialShapes);
    }, []);

    // Draw function
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw background
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw Lines connecting the squares (using centers)
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath();

        if (shapes.length > 0) {
            const first = shapes[0];
            ctx.moveTo(first.x + first.size / 2, first.y + first.size / 2);

            for (let i = 1; i < shapes.length; i++) {
                const s = shapes[i];
                ctx.lineTo(s.x + s.size / 2, s.y + s.size / 2);
            }
        }
        ctx.stroke();

        // Draw Squares
        shapes.forEach(shape => {
            ctx.fillStyle = shape.color;
            ctx.fillRect(shape.x, shape.y, shape.size, shape.size);

            // Highlight if dragging
            if (shape.id === draggingShapeId) {
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.strokeRect(shape.x, shape.y, shape.size, shape.size);
            }
        });

    }, [shapes, draggingShapeId]);

    const handleMouseDown = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Check collision in reverse order (topmost first)
        for (let i = shapes.length - 1; i >= 0; i--) {
            const s = shapes[i];
            if (mouseX >= s.x && mouseX <= s.x + s.size &&
                mouseY >= s.y && mouseY <= s.y + s.size) {

                setDraggingShapeId(s.id);
                setDragOffset({
                    x: mouseX - s.x,
                    y: mouseY - s.y
                });
                return;
            }
        }
    };

    const handleMouseMove = (e) => {
        if (draggingShapeId === null) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        setShapes(prevShapes => prevShapes.map(s => {
            if (s.id === draggingShapeId) {
                return {
                    ...s,
                    x: mouseX - dragOffset.x,
                    y: mouseY - dragOffset.y
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
            <h2>HTML5 Canvas Demo</h2>
            <p>Demonstrating raster-based rendering. <strong>Drag squares to move them!</strong></p>
            <canvas
                ref={canvasRef}
                width={600}
                height={400}
                style={{
                    border: '1px solid #ccc',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                    cursor: draggingShapeId !== null ? 'grabbing' : 'auto'
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            />
        </div>
    );
}

export default CanvasPage;
