import React from 'react';

const GraphEdge = ({ startX, startY, endX, endY, color = "#333" }) => {
    return (
        <line
            x1={startX}
            y1={startY}
            x2={endX}
            y2={endY}
            stroke={color}
            strokeWidth={1}
        />
    );
};

export default GraphEdge;
