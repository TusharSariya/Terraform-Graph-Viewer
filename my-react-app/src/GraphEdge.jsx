import React from 'react';

const GraphEdge = ({ startX, startY, endX, endY }) => {
    return (
        <line
            x1={startX}
            y1={startY}
            x2={endX}
            y2={endY}
            stroke="#333"
            strokeWidth={1}
        />
    );
};

export default GraphEdge;
