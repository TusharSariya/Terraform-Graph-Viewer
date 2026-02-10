import { useState, useEffect, useRef } from 'react';
import LambdaIcon from './assets/svg/Compute/Lambda.svg';
import SQSIcon from './assets/svg/App-Integration/Simple-Queue-Service.svg';
import S3Icon from './assets/svg/Storage/Simple-Storage-Service.svg';
import IAMIcon from './assets/more-icons/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Role_48.svg';
import AWSIcon from './assets/more-icons/Architecture-Group-Icons_07312025/AWS-Cloud_32.svg';
import CloudwatchIcon from './assets/svg/Management-Governance/CloudWatch.svg'
import IamPolicy from './assets/policy-svgrepo-com.svg'
import ZipIcon from './assets/zip-file-svgrepo-com.svg'
import RoughLine from './RoughLine';

import GraphNode from './GraphNode';
import RoughEdge from './RoughEdge';
import GraphControls from './GraphControls';
import SaveGraph from './saveGraph';
import ContextMenu from './ContextMenu';

import useGraphData from './hooks/useGraphData';
import useGraphInteraction from './hooks/useGraphInteraction';
import useGraphLayout from './hooks/useGraphLayout';
import { generateMenuItems } from './utils/contextMenuUtils';

/**
 * Offset line endpoints from shape center to shape edge.
 * Returns { startX, startY, endX, endY } so the line stops at the shape boundaries.
 */
function offsetEdgeToShapeEdge(startX, startY, endX, endY, startSize, endSize, margin = 0) {
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.hypot(dx, dy) || 0.001;
    const ux = dx / distance;
    const uy = dy / distance;

    const startRadius = startSize / 2 + margin;
    const endRadius = endSize / 2 + margin;

    return {
        startX: startX + startRadius * ux,
        startY: startY + startRadius * uy,
        endX: endX - endRadius * ux,
        endY: endY - endRadius * uy
    };
}

const iconMap = {
    "aws_sqs_queue": SQSIcon,
    "aws_s3_bucket": S3Icon,
    "aws_lambda_function": LambdaIcon,
    "aws_iam_role": IAMIcon,
    "aws_cloud": AWSIcon,
    "aws_cloudwatch_log_group": CloudwatchIcon,
    "aws_iam_policy_document": IamPolicy,
    "aws_iam_role_policy": IamPolicy,
};

function SvgPage() {
    const svgRef = useRef(null);
    const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

    const { shapes, setShapes, paths, setPaths } = useGraphData();

    // Auto-layout the graph
    useGraphLayout(shapes, setShapes, paths, setPaths, dimensions);

    const {
        viewTransform,
        isPanning,
        draggingShapeId,
        mode, setMode,
        drawnLines, setDrawnLines,
        currentLine,
        handleWheel,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        handleContextMenu,
        contextMenus,
        handleCloseContextMenu,
        handleContextMenuMouseDown
    } = useGraphInteraction(svgRef, shapes, setShapes);

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

    return (
        <div style={{
            position: 'absolute',
            top: '60px',
            left: 0,
            width: '100%',
            height: 'calc(100vh - 60px)',
            overflow: 'hidden'
        }}>

            <GraphControls mode={mode} setMode={setMode} zoomScale={viewTransform.scale} />
            <SaveGraph shapes={shapes} paths={paths} drawLines={drawnLines} />

            <svg
                ref={svgRef}
                width={dimensions.width}
                height={dimensions.height}
                style={{
                    background: '#f0f0f0',
                    cursor: mode === 'draw' ? 'crosshair' : (isPanning ? 'grabbing' : 'grab'),
                    display: 'block'
                }}
                onMouseDown={(e) => handleMouseDown(e, null)}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                onContextMenu={(e) => e.preventDefault()}
            >
                <g transform={`translate(${viewTransform.x}, ${viewTransform.y}) scale(${viewTransform.scale})`}>
                    <defs>
                        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e0e0e0" strokeWidth="1" />
                        </pattern>
                    </defs>
                    <rect x="-50000" y="-50000" width="100000" height="100000" fill="url(#grid)" />

                    {/* User Drawn Arrows */}
                    {drawnLines.map((line, i) => (
                        <RoughLine
                            key={`drawn-${line.id || i}`}
                            x1={line.x1}
                            y1={line.y1}
                            x2={line.x2}
                            y2={line.y2}
                            stroke="#1a1a1aff"
                            strokeWidth={2}
                            hasArrow={true}
                            cursor={mode === 'eraser' ? 'pointer' : 'default'}
                            onClick={() => {
                                if (mode === 'eraser') {
                                    setDrawnLines(prev => prev.filter(l => l.id !== line.id));
                                }
                            }}
                        />
                    ))}

                    {/* Currently Drawing Arrow */}
                    {currentLine && (
                        <RoughLine
                            x1={currentLine.x1}
                            y1={currentLine.y1}
                            x2={currentLine.x2}
                            y2={currentLine.y2}
                            stroke="#333"
                            strokeWidth={2}
                            hasArrow={true}
                        />
                    )}

                    {/* Layer 1: Edges (Background) */}
                    {/* draw edges_new */}
                    {Object.values(shapes).map((shape) => (
                        shape.showLabel && shape.edges_new && shape.edges_new.map(edgePath => {
                            const targetAddresses = paths[edgePath];
                            if (!targetAddresses) return null;

                            return targetAddresses.map(targetAddress => {
                                const depShape = shapes[targetAddress];
                                if (!depShape) return null;
                                const pts = offsetEdgeToShapeEdge(
                                    shape.x + shape.size / 2, shape.y + shape.size / 2,
                                    depShape.x + depShape.size / 2, depShape.y + depShape.size / 2,
                                    shape.size, depShape.size,
                                    5
                                );
                                return (
                                    <RoughEdge
                                        key={`conn-new-${shape.id}-${depShape.id}`}
                                        startX={pts.startX}
                                        startY={pts.startY}
                                        endX={pts.endX}
                                        endY={pts.endY}
                                        color="#008f15ff"
                                    />
                                );
                            });
                        })
                    ))}

                    {/* draw edges_existing */}
                    {Object.values(shapes).map((shape) => (
                        shape.showLabel && shape.edges_existing && shape.edges_existing.map(edgePath => {
                            const targetAddresses = paths[edgePath];
                            if (!targetAddresses) return null;

                            return targetAddresses.map(targetAddress => {
                                const depShape = shapes[targetAddress];
                                if (!depShape) return null;
                                const pts = offsetEdgeToShapeEdge(
                                    shape.x + shape.size / 2, shape.y + shape.size / 2,
                                    depShape.x + depShape.size / 2, depShape.y + depShape.size / 2,
                                    shape.size, depShape.size,
                                    5
                                );
                                return (
                                    <RoughEdge
                                        key={`conn-existing-${shape.id}-${depShape.id}`}
                                        startX={pts.startX}
                                        startY={pts.startY}
                                        endX={pts.endX}
                                        endY={pts.endY}
                                        color="#333"
                                    />
                                );
                            });
                        })
                    ))}

                    {/* Layer 2: Nodes (Foreground) */}
                    {Object.values(shapes).map((shape) => (
                        <GraphNode
                            key={`group-${shape.id}`}
                            shape={shape}
                            icon={iconMap[shape.type] || AWSIcon}
                            isDragging={draggingShapeId === shape.id}
                            onMouseDown={handleMouseDown}
                            onContextMenu={handleContextMenu}
                        />
                    ))}
                    {/* Lines from shapes to their context menus */}
                    {Object.values(contextMenus).map((contextMenu) => {
                        if (!contextMenu.visible) return null;
                        const shape = shapes[contextMenu.shapeId];
                        if (!shape) return null;
                        return (
                            <line
                                key={`ctx-line-${contextMenu.shapeId}`}
                                x1={shape.x + shape.size / 2}
                                y1={shape.y + shape.size / 2}
                                x2={contextMenu.x}
                                y2={contextMenu.y}
                                stroke="#999"
                                strokeWidth={1}
                                strokeDasharray="4 3"
                                pointerEvents="none"
                            />
                        );
                    })}

                    {Object.values(contextMenus).map((contextMenu) => (
                        contextMenu.visible && (
                            <foreignObject x={contextMenu.x} y={contextMenu.y} width="200" height="300" style={{ overflow: 'visible' }}>
                                <ContextMenu
                                    embedded={true}
                                    onMouseDown={(e) => handleContextMenuMouseDown(e, contextMenu.shapeId)}
                                    onClose={() => handleCloseContextMenu(contextMenu.shapeId)}
                                    items={[
                                        {
                                            label: "Diff",
                                            subItems: generateMenuItems(contextMenu.diff, "diffs")
                                        },
                                        {
                                            label: "Before State",
                                            subItems: generateMenuItems(contextMenu.before_state, "Before")
                                        },
                                        {
                                            label: "After State",
                                            subItems: generateMenuItems(contextMenu.after_state, "After")
                                        },
                                        {
                                            label: "AI insights",
                                            subItems: generateMenuItems(contextMenu.AI,"AI")
                                        }
                                    ]}
                                />
                            </foreignObject>
                        )))}
                </g>


            </svg>


        </div>
    );
}

export default SvgPage;
