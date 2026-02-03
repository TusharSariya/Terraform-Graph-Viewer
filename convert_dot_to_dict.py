import re
import json
import sys
import os
from collections import defaultdict

def parse_dot_edges(file_path):
    """
    Parses a DOT file and returns an adjacency list (dictionary).
    Key: Source Node (Left side)
    Value: List of Target Nodes (Right side)
    """
    adjacency_list = defaultdict(list)
    
    try:
        with open(file_path, 'r') as f:
            lines = f.readlines()
            
        for line in lines:
            if "->" not in line:
                continue
            strings = line.split("->")
            source = strings[0].strip()
            target = strings[1].strip()
            sources = source.split(" ")
            targets = target.split(" ")
            #gnarly
            adjacency_list[sources[1].replace("\"", "").replace("\\","")].append(targets[1].replace("\"", "").replace("\\",""))
                
        return dict(adjacency_list)

    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    # Look for graph.dot in obvious places if not provided
    default_paths = [
        "graph.dot",
        "../graph.dot",
        "/home/tushar/Projects/terraform/test/graph.dot"
    ]
    
    file_path = None
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
    else:
        for p in default_paths:
            if os.path.exists(p):
                file_path = p
                break
    
    if not file_path:
        print(json.dumps({"error": "graph.dot not found"}))
        sys.exit(1)

    result = parse_dot_edges(file_path)
    print(json.dumps(result, indent=2))
