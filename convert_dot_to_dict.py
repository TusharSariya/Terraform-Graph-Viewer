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
    
    # Edge regex: "[root] ... (expand)" -> "[root] ..."
    # This matches the quoted strings on either side of the arrow
    edge_pattern = re.compile(r'^\s*"(.+?)"\s*->\s*"(.+?)"')
    
    try:
        with open(file_path, 'r') as f:
            lines = f.readlines()
            
        for line in lines:
            print(line)
            line = line.strip()
            match = edge_pattern.match(line)
            if match:
                source = match.group(1)
                target = match.group(2)
                
                source = clean_id(source)
                target = clean_id(target)
                
                adjacency_list[source].append(target)
                
        return dict(adjacency_list)

    except Exception as e:
        return {"error": str(e)}

def clean_id(node_id):
    """
    Helper to remove extra Terraform metadata from the ID strings
    Example: "[root] aws_s3_bucket.test (expand)" -> "aws_s3_bucket.test"
    """
    # Remove [root] prefix
    s = node_id.replace("[root] ", "")
    # Remove suffixes like (expand), (close), (expand, input)
    # Matches parenthesis at the end of the string
    s = re.sub(r'\s*\([^)]*\)$', '', s)
    return s.strip()

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
