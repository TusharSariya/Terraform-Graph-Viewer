import { useEffect, useRef } from 'react';
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide } from 'd3-force';

const useGraphLayout = (shapes, setShapes, paths, setPaths, dimensions) => {
    const simulationRef = useRef(null);

    useEffect(() => {
        if (!shapes || Object.keys(shapes).length === 0) return;
        console.log("Shapes: ", shapes); //shapes is address , id is address, path is path
        console.log("Paths: ", paths); //paths is path, address is address

        // 1. Prepare Nodes and Links for D3
        // D3 modifies objects in place, so we need a shallow copy or use the existing objects carefully.
        // We'll map shapes to an array of nodes.
        //list of all nodes, id is address, path is path, address is address
        const nodes = Object.values(shapes).map(s => ({ ...s }));
        console.log("Nodes: ", nodes);

        // Extract links from the 'edges' property of each shape
        const links = [];
        nodes.forEach(sourceNode => {
            const edges = sourceNode.edges_new.concat(sourceNode.edges_existing);
            if (edges) {
                edges.forEach(targetId => {
                    paths[targetId].forEach(address => {
                        links.push({ source: sourceNode.id, target: address });
                    });
                });
            }
        });
        console.log("Links: ", links);

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

    }, [Object.keys(shapes).length, paths, dimensions.width, dimensions.height]); // Re-run if node count changes

    return {};
};

export default useGraphLayout;
