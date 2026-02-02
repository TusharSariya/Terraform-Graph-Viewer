import React, { useRef, useEffect } from 'react';
import rough from 'roughjs/bin/rough';

const RoughLine = ({ x1, y1, x2, y2, stroke, strokeWidth, hasArrow, onClick, cursor }) => {
    const svgRef = useRef(null);

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;

        // Clear previous content
        while (svg.firstChild) {
            svg.removeChild(svg.firstChild);
        }

        const rc = rough.svg(svg);
        const options = {
            stroke: stroke || '#333',
            strokeWidth: strokeWidth || 1,
            roughness: 1.5,
            bowing: 1.5
        };

        const line = rc.line(x1, y1, x2, y2, options);
        svg.appendChild(line);

        // Arrowhead logic
        if (hasArrow) {
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const arrowLength = 20;
            const arrowAngle = Math.PI / 6; // 30 degrees

            // Calculate arrowhead points
            const x3 = x2 - arrowLength * Math.cos(angle - arrowAngle);
            const y3 = y2 - arrowLength * Math.sin(angle - arrowAngle);
            const x4 = x2 - arrowLength * Math.cos(angle + arrowAngle);
            const y4 = y2 - arrowLength * Math.sin(angle + arrowAngle);

            const arrowLine1 = rc.line(x2, y2, x3, y3, options);
            const arrowLine2 = rc.line(x2, y2, x4, y4, options);

            svg.appendChild(arrowLine1);
            svg.appendChild(arrowLine2);
        }

    }, [x1, y1, x2, y2, stroke, strokeWidth, hasArrow]);

    return (
        <g style={{ cursor: cursor || 'default' }}>
            <g ref={svgRef} style={{ pointerEvents: 'none' }} />
            {/* Invisible hit box for easier clicking */}
            <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="transparent"
                strokeWidth={15}
                onClick={onClick}
                style={{ pointerEvents: onClick ? 'stroke' : 'none' }}
            />
        </g>
    );
};

export default RoughLine;
