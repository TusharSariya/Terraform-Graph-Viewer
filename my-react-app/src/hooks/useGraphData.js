import { useState, useEffect } from 'react';

function terraformShapes(data) {
    const shapes = {};

    for (const [path, nodes] of Object.entries(data)) {
        for (const resource of nodes["resources"]) {
            shapes[resource.address] = ({
                path: path,
                address: resource.address,
                x: Math.random() * 100,
                y: Math.random() * 100,
                size: 40,
                color: 'red',
                name: resource.name,
                edges_new: nodes.edges_new,
                edges_existing: nodes.edges_existing,
                type: resource.type,
                showLabel: false // Default to hidden, consistent with original logic
            })
        }
    }
    console.log("Shapes: ", shapes);

    return shapes;
}

const useGraphData = () => {
    const [shapes, setShapes] = useState({});

    useEffect(() => {
        fetch('http://localhost:8000/api/graph2')
            .then(res => res.json())
            .then(jsonData => {
                console.log("Fetched Data:", jsonData);
                return terraformShapes(jsonData);
            })
            .then(newShapes => {
                setShapes(newShapes);
                console.log("Shapes: ", newShapes);
            })
            .catch(err => console.error("Error fetching data:", err));
    }, []);

    return { shapes, setShapes };
};

export default useGraphData;
