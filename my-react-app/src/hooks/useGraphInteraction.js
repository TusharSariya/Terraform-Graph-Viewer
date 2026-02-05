import { useState, useRef, useEffect } from 'react';

const useGraphInteraction = (svgRef, shapes, setShapes) => {
    const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, scale: 1 });
    const [draggingShapeId, setDraggingShapeId] = useState(null);
    const [isPanning, setIsPanning] = useState(false);
    const [mode, setMode] = useState('pan'); // 'pan' | 'draw' | 'eraser'
    const [drawnLines, setDrawnLines] = useState([]);
    const [currentLine, setCurrentLine] = useState(null);
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, shapeId: null });

    const dragStartRef = useRef({ x: 0, y: 0 });
    const initialTransformRef = useRef({ x: 0, y: 0 });
    const initialShapePosRef = useRef({ x: 0, y: 0 });

    const getSVGPoint = (clientX, clientY) => {
        const svg = svgRef.current;
        if (!svg) return { x: 0, y: 0 };
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

        const pt = getSVGPoint(e.clientX, e.clientY);

        setShapes((prevShapes) => {
            const targetShape = prevShapes[shapeId]; //get shape that we clicked on
            const updatedShape = {
                ...targetShape,
                showLabel: !targetShape.showLabel
            }; //invert the lable property
            const newShapesCollection = { ...prevShapes }; //make a new shapes collection
            newShapesCollection[shapeId] = updatedShape; //add my new shape to it
            return newShapesCollection; //set new shapes collection
        });


        setContextMenu({
            visible: true,
            x: pt.x,
            y: pt.y,
            shapeId: shapeId
        });
    };

    const handleCloseContextMenu = () => {
        setContextMenu(prev => ({ ...prev, visible: false }));
    };

    return {
        viewTransform,
        setViewTransform,
        isPanning,
        draggingShapeId,
        mode,
        setMode,
        drawnLines,
        setDrawnLines,
        currentLine,
        handleWheel,
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        handleMouseMove,
        handleMouseUp,
        handleContextMenu,
        contextMenu,
        handleCloseContextMenu
    };
};

export default useGraphInteraction;
