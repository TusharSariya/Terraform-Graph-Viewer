import React from 'react';

const GraphNode = ({ shape, icon, isDragging, onMouseDown, onContextMenu }) => {
    return (
        <g>
            <image
                href={icon}
                x={shape.x}
                y={shape.y}
                width={shape.size}
                height={shape.size}
                onMouseDown={(e) => onMouseDown(e, shape.id)}
                onContextMenu={(e) => onContextMenu(e, shape)}
                style={{
                    cursor: 'move',
                    filter: isDragging ? 'drop-shadow(0 0 5px white)' : 'none'
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
                    {shape.id}
                </text>
            )}
        </g>
    );
};

export default GraphNode;
