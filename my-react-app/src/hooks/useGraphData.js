import { useState, useEffect } from 'react';

function terraformShapes(data) {
    const shapes = {};

    for (const [key, value] of Object.entries(data)) {
        console.log("Key: ", key);
        console.log("Value: ", value);
        shapes[key] = ({
            id: key,
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: 40,
            color: 'red',
            name: key,
            edges_new: value.edges_new,
            edges_existing: value.edges_existing,
            type: value.type,
            showLabel: false // Default to hidden, consistent with original logic
        })
    }

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
