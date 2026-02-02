import { useEffect, useRef } from 'react';

function CanvasPage() {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        // Set canvas size
        canvas.width = 600;
        canvas.height = 400;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw background
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw Random Squares
        const shapes = [];
        for (let i = 0; i < 10; i++) {
            const size = 30 + Math.random() * 20;
            const x = Math.random() * (canvas.width - size);
            const y = Math.random() * (canvas.height - size);
            const color = `hsl(${Math.random() * 360}, 70%, 50%)`;

            ctx.fillStyle = color;
            ctx.fillRect(x, y, size, size);

            // Store center points for lines
            shapes.push({ x: x + size / 2, y: y + size / 2 });
        }

        // Draw Lines connecting the squares
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.beginPath();

        if (shapes.length > 0) {
            ctx.moveTo(shapes[0].x, shapes[0].y);
            for (let i = 1; i < shapes.length; i++) {
                ctx.lineTo(shapes[i].x, shapes[i].y);
            }
        }

        ctx.stroke();

    }, []);

    return (
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <h2>HTML5 Canvas Demo</h2>
            <p>Demonstrating raster-based rendering with squares and lines.</p>
            <canvas
                ref={canvasRef}
                style={{ border: '1px solid #ccc', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
            />
        </div>
    );
}

export default CanvasPage;
