import { useState, useEffect } from 'react';

function terraformShapes(data) {
    const shapes = {};

    for (const [path, nodes] of Object.entries(data)) {
        const resources = nodes["resources"];
        for (const [address, resource] of Object.entries(resources)) {
            shapes[resource.address] = ({
                id: resource.address,
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

    return shapes;
}

function terraformPaths(data) {
    const paths = {};
    for (const [path, nodes] of Object.entries(data)) {
        const resources = nodes["resources"];
        for (const [address, resource] of Object.entries(resources)) {
            if (!paths[path]) paths[path] = [];
            paths[path].push(resource.address);
        }
    }
    return paths;
}

const useGraphData = () => {
    const [shapes, setShapes] = useState({});
    const [paths, setPaths] = useState({});

    useEffect(() => {
        fetch('http://localhost:8000/api/graph2')
            .then(res => res.json())
            .then(jsonData => {
                setShapes(terraformShapes(jsonData));
                setPaths(terraformPaths(jsonData));
            })
            .catch(err => console.error("Error fetching data:", err));
    }, []);

    return { shapes, setShapes, paths, setPaths };
};

export default useGraphData;
