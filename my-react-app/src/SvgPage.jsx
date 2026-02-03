import { useState, useEffect, useRef } from 'react';
import LambdaIcon from './assets/svg/Compute/Lambda.svg';
import SQSIcon from './assets/svg/App-Integration/Simple-Queue-Service.svg';
import S3Icon from './assets/svg/Storage/Simple-Storage-Service.svg';
import RoughLine from './RoughLine';


const iconMap = {
    "aws_sqs_queue": SQSIcon,
    "aws_s3_bucket": S3Icon,
    "aws_lambda_function": LambdaIcon
}


function terraformShapes(data) {
    const shapes = {};

    for (const [key, value] of Object.entries(data)) {
        shapes[key] = ({
            id: key,
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: 40,
            color: 'red',
            name: key,
            edges: value.edges,
            type: value.type
        })
    }

    return shapes;
}

function SvgPage() {
    const [shapes, setShapes] = useState({});
    const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [draggingShapeId, setDraggingShapeId] = useState(null);
    const [isPanning, setIsPanning] = useState(false);
    const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
    const [data, setData] = useState([])

    // Drawing Mode State
    const [mode, setMode] = useState('pan'); // 'pan' | 'draw' | 'eraser'
    const [drawnLines, setDrawnLines] = useState([]);
    const [currentLine, setCurrentLine] = useState(null);

    const dragStartRef = useRef({ x: 0, y: 0 });
    const initialTransformRef = useRef({ x: 0, y: 0 });
    const initialShapePosRef = useRef({ x: 0, y: 0 });

    const svgRef = useRef(null);

    // Initial shape generation with Random Names
    const shapeNames = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa", "Lambda", "Mu"];

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

    useEffect(() => {
        fetch('http://localhost:8000/api/graph')
            .then(res => res.json())
            .then(jsonData => { console.log("Fetched Data:", jsonData); return terraformShapes(jsonData) })
            .then(shapes => { setShapes(shapes); console.log("Shapes: ", shapes) })
            .catch(err => console.error("Error fetching data:", err))
    }, [])

    //creates rectangles in random places
    useEffect(() => {
        const newShapes = [];
        const bounds = { w: 2000, h: 2000 };

        for (let i = 0; i < 10; i++) {
            const size = 40;
            const x = Math.random() * (bounds.w / 2);
            const y = Math.random() * (bounds.h / 2);
            const color = `hsl(${Math.random() * 360}, 70%, 50%)`;
            const name = shapeNames[Math.floor(Math.random() * shapeNames.length)] + "-" + (i + 1);

            newShapes.push({
                id: i,
                x,
                y,
                size,
                color,
                name,
                showLabel: false // Default to hidden
            });
        }

        //setShapes(newShapes);
    }, []);

    const getSVGPoint = (clientX, clientY) => {
        const svg = svgRef.current;
        const pt = svg.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        return {
            x: (pt.x - svg.getBoundingClientRect().left - viewTransform.x) / viewTransform.scale,
            y: (pt.y - svg.getBoundingClientRect().top - viewTransform.y) / viewTransform.scale
        };
    };

    const handleWheel = (e) => {
        e.preventDefault();
        const scaleAmount = -e.deltaY * 0.001;
        const newScale = Math.max(0.1, Math.min(viewTransform.scale * (1 + scaleAmount), 5));

        const rect = svgRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const scaleRatio = newScale / viewTransform.scale;
        const newX = mouseX - (mouseX - viewTransform.x) * scaleRatio;
        const newY = mouseY - (mouseY - viewTransform.y) * scaleRatio;

        setViewTransform({ x: newX, y: newY, scale: newScale });
    };

    const handleMouseDown = (e, shapeId = null) => {
        if (e.button !== 0) return;

        if (mode === 'draw' && shapeId === null) {
            // Start Drawing Arrow
            e.preventDefault();
            const pt = getSVGPoint(e.clientX, e.clientY);
            setCurrentLine({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
            return;
        }

        if (shapeId !== null) {
            // Drag Shape
            e.stopPropagation();
            e.preventDefault();
            const pt = getSVGPoint(e.clientX, e.clientY);
            const shape = shapes[shapeId];
            setDraggingShapeId(shapeId);
            dragStartRef.current = { x: pt.x, y: pt.y };
            initialShapePosRef.current = { x: shape.x, y: shape.y };
        } else {
            // Pan Canvas
            e.preventDefault();
            setIsPanning(true);
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            initialTransformRef.current = { x: viewTransform.x, y: viewTransform.y };
        }
    };

    const handleMouseMove = (e) => {
        e.preventDefault();

        if (currentLine) {
            // Update Drawing Arrow
            const pt = getSVGPoint(e.clientX, e.clientY);
            setCurrentLine(prev => ({ ...prev, x2: pt.x, y2: pt.y }));
        }
        else if (draggingShapeId !== null) {
            // Drag Shape
            const pt = getSVGPoint(e.clientX, e.clientY);
            const dx = pt.x - dragStartRef.current.x;
            const dy = pt.y - dragStartRef.current.y;

            setShapes(prevShapes => ({
                ...prevShapes,
                [draggingShapeId]: {
                    ...prevShapes[draggingShapeId],
                    x: initialShapePosRef.current.x + dx,
                    y: initialShapePosRef.current.y + dy
                }
            }));

        } else if (isPanning) {
            // Pan
            const dx = e.clientX - dragStartRef.current.x;
            const dy = e.clientY - dragStartRef.current.y;

            setViewTransform({
                ...viewTransform,
                x: initialTransformRef.current.x + dx,
                y: initialTransformRef.current.y + dy
            });
        }
    };

    const handleMouseUp = () => {
        if (currentLine) {
            // Finish Drawing
            setDrawnLines(prev => [...prev, { ...currentLine, id: Date.now() }]);
            setCurrentLine(null);
        }
        setDraggingShapeId(null);
        setIsPanning(false);
    };

    const handleContextMenu = (e, shapeId) => {
        e.preventDefault();
        e.stopPropagation();

        setShapes(prevShapes => ({
            ...prevShapes,
            [shapeId]: {
                ...prevShapes[shapeId],
                showLabel: !prevShapes[shapeId].showLabel
            }
        }));
    };

    return (
        <div style={{
            position: 'absolute',
            top: '60px',
            left: 0,
            width: '100%',
            height: 'calc(100vh - 60px)',
            overflow: 'hidden'
        }}>
            <div style={{
                position: 'absolute',
                top: 10,
                left: 10,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                zIndex: 100
            }}>
                <div style={{
                    background: 'rgba(255, 255, 255, 0.9)',
                    padding: '10px',
                    borderRadius: '8px',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                    pointerEvents: 'none'
                }}>
                    <h3 style={{ margin: '0 0 5px 0' }}>SVG Infinite Canvas</h3>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                        Right-click box to show name<br />
                        Zoom: {Math.round(viewTransform.scale * 100)}%
                    </div>
                </div>

                {/* Toolbar */}
                <div style={{
                    background: 'white',
                    padding: '5px',
                    borderRadius: '8px',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                    display: 'flex',
                    gap: '5px'
                }}>
                    <button
                        onClick={() => setMode('pan')}
                        style={{
                            background: mode === 'pan' ? '#e0efff' : 'transparent',
                            border: mode === 'pan' ? '1px solid #1a73e8' : '1px solid transparent',
                            cursor: 'pointer'
                        }}
                    >
                        ✋ Pan
                    </button>
                    <button
                        onClick={() => setMode('draw')}
                        style={{
                            background: mode === 'draw' ? '#e0efff' : 'transparent',
                            border: mode === 'draw' ? '1px solid #1a73e8' : '1px solid transparent',
                            cursor: 'pointer'
                        }}
                    >
                        ✏️ Draw
                    </button>
                    <button
                        onClick={() => setMode('eraser')}
                        style={{
                            background: mode === 'eraser' ? '#e0efff' : 'transparent',
                            border: mode === 'eraser' ? '1px solid #1a73e8' : '1px solid transparent',
                            cursor: 'pointer'
                        }}
                    >
                        🧹 Eraser
                    </button>
                </div>
            </div>

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

                    {/* Auto-connected lines */}
                    {/*shapes.map((shape, i) => {
                        if (i === shapes.length - 1) return null;
                        const nextShape = shapes[i + 1];
                        return (
                            <RoughLine
                                key={`line-${i}`}
                                x1={shape.x + shape.size / 2}
                                y1={shape.y + shape.size / 2}
                                x2={nextShape.x + nextShape.size / 2}
                                y2={nextShape.y + nextShape.size / 2}
                                stroke="#333"
                                strokeWidth="2"
                                style={{ pointerEvents: 'none' }}
                            />
                        );
                    })*/}

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

                    {/* Lambda Icons */}
                    {Object.values(shapes).map((shape) => (
                        <g key={`group-${shape.id}`}>
                            <image
                                href={iconMap[shape.type] || LambdaIcon}
                                x={shape.x}
                                y={shape.y}
                                width={shape.size}
                                height={shape.size}
                                onMouseDown={(e) => handleMouseDown(e, shape.id)}
                                onContextMenu={(e) => handleContextMenu(e, shape.id)}
                                style={{
                                    cursor: 'move',
                                    filter: draggingShapeId === shape.id ? 'drop-shadow(0 0 5px white)' : 'none'
                                }}
                            />
                            {shape.showLabel && shape.edges && shape.edges.map(edge => {
                                const depShape = shapes[edge];
                                if (!depShape) return null;
                                return (
                                    <RoughLine
                                        key={`conn-${shape.id}-${depShape.id}`}
                                        x1={shape.x + shape.size / 2}
                                        y1={shape.y + shape.size / 2}
                                        x2={depShape.x + depShape.size / 2}
                                        y2={depShape.y + depShape.size / 2}
                                        stroke="#ccc"
                                        strokeWidth={1}
                                        hasArrow={true}
                                    />
                                );
                            })}

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
                                    {shape.name}
                                </text>
                            )}
                        </g>
                    ))}
                </g>
            </svg>
        </div>
    );
}

export default SvgPage;
