import React, { useRef, useEffect } from 'react';
import rough from 'roughjs/bin/rough';

const RoughEdge = ({ startX, startY, endX, endY, color = '#333', strokeWidth = 2 }) => {
    const svgRef = useRef(null);
    const x1 = startX;
    const y1 = startY;
    const x2 = endX;
    const y2 = endY;

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;

        // Clear previous content
        while (svg.firstChild) {
            svg.removeChild(svg.firstChild);
        }

        const rc = rough.svg(svg);
        const options = {
            stroke: color,
            strokeWidth: strokeWidth,
            roughness: 1.5,
            bowing: 1.2
        };

        const line = rc.line(x1, y1, x2, y2, options);
        svg.appendChild(line);

        const arrowLength = 14;
        const arrowAngle = Math.PI / 6; // 30 degrees

        // Arrow at end (pointing toward endX, endY)
        const angleEnd = Math.atan2(y2 - y1, x2 - x1);
        const x3 = x2 - arrowLength * Math.cos(angleEnd - arrowAngle);
        const y3 = y2 - arrowLength * Math.sin(angleEnd - arrowAngle);
        const x4 = x2 - arrowLength * Math.cos(angleEnd + arrowAngle);
        const y4 = y2 - arrowLength * Math.sin(angleEnd + arrowAngle);
        const arrowEnd1 = rc.line(x2, y2, x3, y3, options);
        const arrowEnd2 = rc.line(x2, y2, x4, y4, options);
        svg.appendChild(arrowEnd1);
        svg.appendChild(arrowEnd2);

        // Arrow at start (pointing toward startX, startY - i.e. from end toward start)
        const angleStart = Math.atan2(y1 - y2, x1 - x2);
        const x5 = x1 - arrowLength * Math.cos(angleStart - arrowAngle);
        const y5 = y1 - arrowLength * Math.sin(angleStart - arrowAngle);
        const x6 = x1 - arrowLength * Math.cos(angleStart + arrowAngle);
        const y6 = y1 - arrowLength * Math.sin(angleStart + arrowAngle);
        const arrowStart1 = rc.line(x1, y1, x5, y5, options);
        const arrowStart2 = rc.line(x1, y1, x6, y6, options);
        svg.appendChild(arrowStart1);
        svg.appendChild(arrowStart2);

    }, [x1, y1, x2, y2, color, strokeWidth]);

    return (
        <g>
            <g ref={svgRef} style={{ pointerEvents: 'none' }} />
        </g>
    );
};

export default RoughEdge;
