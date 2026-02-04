import { useEffect, useRef } from 'react';
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide } from 'd3-force';

const useGraphLayout = (shapes, setShapes, dimensions) => {
    const simulationRef = useRef(null);

    useEffect(() => {
        if (!shapes || Object.keys(shapes).length === 0) return;

        // 1. Prepare Nodes and Links for D3
        // D3 modifies objects in place, so we need a shallow copy or use the existing objects carefully.
        // We'll map shapes to an array of nodes.
        const nodes = Object.values(shapes).map(s => ({ ...s }));

        // Extract links from the 'edges' property of each shape
        const links = [];
        nodes.forEach(sourceNode => {
            const edges = sourceNode.edges_new.concat(sourceNode.edges_existing);
            if (edges) {
                edges.forEach(targetId => {
                    // D3 links need references to the node objects (or ids if using id accessor)
                    links.push({ source: sourceNode.id, target: targetId });
                });
            }
        });

        // 2. Initialize Simulation
        if (simulationRef.current) simulationRef.current.stop();

        simulationRef.current = forceSimulation(nodes)
            .force('charge', forceManyBody().strength(-300)) // Repulsion
            .force('link', forceLink(links).id(d => d.id).distance(100)) // Attraction
            .force('center', forceCenter(dimensions.width / 2, dimensions.height / 2)) // Center
            .force('collide', forceCollide().radius(50)) // Prevent overlap
            .on('tick', () => {
                // 3. Update React State on constant tick (or maybe just on end for performance?)
                // For smooth animation, we update on tick.
                setShapes(prevShapes => {
                    const nextShapes = { ...prevShapes };
                    nodes.forEach(node => {
                        if (nextShapes[node.id]) {
                            nextShapes[node.id] = {
                                ...nextShapes[node.id],
                                x: node.x - (node.size / 2), // D3 uses center x, we use top-left x
                                y: node.y - (node.size / 2)  // D3 uses center y, we use top-left y
                            };
                        }
                    });
                    return nextShapes;
                });
            });

        // 4. Cleanup
        return () => simulationRef.current.stop();

    }, [Object.keys(shapes).length, dimensions.width, dimensions.height]); // Re-run if node count changes

    return {};
};

export default useGraphLayout;
