import { useState, useEffect, useRef } from 'react';
import LambdaIcon from './assets/svg/Compute/Lambda.svg';
import SQSIcon from './assets/svg/App-Integration/Simple-Queue-Service.svg';
import S3Icon from './assets/svg/Storage/Simple-Storage-Service.svg';
import IAMIcon from './assets/more-icons/Resource-Icons_07312025/Res_Security-Identity-Compliance/Res_AWS-Identity-Access-Management_Role_48.svg';
import AWSIcon from './assets/more-icons/Architecture-Group-Icons_07312025/AWS-Cloud_32.svg';
import CloudwatchIcon from './assets/svg/Management-Governance/CloudWatch.svg'
import IamPolicy from './assets/policy-svgrepo-com.svg'
import RoughLine from './RoughLine';

import GraphNode from './GraphNode';
import GraphEdge from './GraphEdge';
import GraphControls from './GraphControls';

import useGraphData from './hooks/useGraphData';
import useGraphInteraction from './hooks/useGraphInteraction';
import useGraphLayout from './hooks/useGraphLayout';

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

    const { shapes, setShapes } = useGraphData();

    // Auto-layout the graph
    useGraphLayout(shapes, setShapes, dimensions);

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
        handleContextMenu
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
                    {Object.values(shapes).map((shape) => (
                        shape.showLabel && shape.edges && shape.edges.map(edge => {
                            const depShape = shapes[edge];
                            if (!depShape) return null;
                            return (
                                <GraphEdge
                                    key={`conn-${shape.id}-${depShape.id}`}
                                    startX={shape.x + shape.size / 2}
                                    startY={shape.y + shape.size / 2}
                                    endX={depShape.x + depShape.size / 2}
                                    endY={depShape.y + depShape.size / 2}
                                />
                            );
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
                </g>
            </svg>
        </div>
    );
}

export default SvgPage;
