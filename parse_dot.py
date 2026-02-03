import re
import json
import sys
import os

def parse_dot_file(file_path):
    """
    Parses a Terraform DOT file and returns a JSON structure with nodes and edges.
    """
    nodes = []
    edges = []
    
    # Regex patterns
    # Node example: "[root] aws_s3_bucket.test (expand)" [label = "aws_s3_bucket.test", shape = "box"]
    # We want to match the ID (first quotes) and the Attributes (label, shape)
    node_pattern = re.compile(r'^\s*"(.+?)"\s*\[(.+)\]')
    
    # Edge example: "[root] aws_s3_bucket.test (expand)" -> "[root] provider[\"registry.opentofu.org/hashicorp/aws\"]"
    edge_pattern = re.compile(r'^\s*"(.+?)"\s*->\s*"(.+?)"')
    
    # Attribute matcher
    # label = "foo"
    label_pattern = re.compile(r'label\s*=\s*"(.+?)"')
    shape_pattern = re.compile(r'shape\s*=\s*"(.+?)"')

    try:
        with open(file_path, 'r') as f:
            lines = f.readlines()
            
        for line in lines:
            line = line.strip()
            
            # Check for Edge first (edges don't have bracket attributes at the end usually in default TF graph)
            # Actually TF graph edges sometimes have attributes? Usually not.
            edge_match = edge_pattern.match(line)
            if edge_match:
                source = edge_match.group(1)
                target = edge_match.group(2)
                edges.append({
                    "source": source,
                    "target": target
                })
                continue
                
            # Check for Node
            node_match = node_pattern.match(line)
            if node_match:
                node_id = node_match.group(1)
                attributes_str = node_match.group(2)
                
                label_match = label_pattern.search(attributes_str)
                shape_match = shape_pattern.search(attributes_str)
                
                label = label_match.group(1) if label_match else node_id
                shape = shape_match.group(1) if shape_match else "box"
                
                # Cleanup Label (optional)
                # Remove [root] prefix from label if present?
                # Usually labels in the graph.dot are clean "aws_s3_bucket.test"
                
                nodes.append({
                    "id": node_id,
                    "label": label,
                    "shape": shape,
                    "type": shape # shape usually indicates type (box=node, diamond=provider, etc)
                })
                continue

        return {
            "nodes": nodes,
            "edges": edges
        }

    except Exception as e:
        return {"error": str(e)}

def clean_id(node_id):
    """
    Optional: Helper to make IDs cleaner for frontend if needed.
    Currently used to strip [root] for display if desired, 
    but for linking we must strictly match source/target.
    """
    return node_id.replace("[root] ", "").replace(" (expand)", "").replace(" (close)", "")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        # Default to ../graph.dot for convenience in this environment
        default_path = os.path.join(os.path.dirname(__file__), "../graph.dot")
        if os.path.exists(default_path):
            file_path = default_path
        else:
            print("Usage: python3 parse_dot.py <path_to_graph.dot>")
            sys.exit(1)
    else:
        file_path = sys.argv[1]

    data = parse_dot_file(file_path)
    print(json.dumps(data, indent=2))
