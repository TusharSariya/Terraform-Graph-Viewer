from flask import Flask, jsonify, request
from flask_cors import CORS
from terraformPlan import TerraformPlan
import json
from pprint import pprint
import os
from collections import defaultdict
import traceback
import re
import tempfile
import pydot
import networkx as nx


app = Flask(__name__)
app.json.sort_keys = False
app.config["JSONIFY_PRETTYPRINT_REGULAR"] = True
CORS(app)  # Enable CORS for all routes

@app.route('/')
def home():
    return jsonify({
        "status": "success",
        "message": "Flask backend is running!"
    })

@app.route('/api/data')
def get_data():
    return jsonify({
        "data": [
            {"id": 1, "name": "Item 1"},
            {"id": 2, "name": "Item 2"},
            {"id": 3, "name": "Item 3"}
        ]
    })


@app.route('/api/mock')
def get_mock():
    """Read and return mock.json."""
    current_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(current_dir, 'mock.json')
    with open(file_path) as f:
        data = json.load(f)
    return jsonify(data)


@app.route('/api/plan')
def get_plan():
    # Load the plan using the object model
    plan, error = TerraformPlan.from_file(['plan-large.json', '../plan-large.json'])
    
    if plan:
        return jsonify(plan.to_dict())
    else:
        return jsonify({"error": error}), 500


@app.route('/api/graph')
def get_graph():
    # this uses tofu graph
    # Load the plan using the object model
    def configRecursion(baseaddress,module):
        mystr = "module"
        if "root_module" in module:
            mystr = "root_module"
        
        for resource in module[mystr]['resources']:
            address = resource['address']
            if 'expressions' in resource:
                expressions = resource['expressions']
                for key,value in expressions.items():
                    if 'references' in value:
                        for ref in value['references']:
                            if ref.startswith("var"):
                                continue
                            if baseaddress is not None:
                                fullref = baseaddress+ref
                            else:
                                fullref = ref
                            if fullref not in edges:
                                edges[fullref] = []
                            if baseaddress is None:
                                edges[fullref].append(address)
                            else:
                                edges[fullref].append(baseaddress+address)
            
        
        if "module_calls" in module[mystr]:
            if baseaddress is None:
                baseaddress = "module"
            else:
                baseaddress = baseaddress+"module"
            for key,value in module[mystr]['module_calls'].items():
                tembbaseaddress = baseaddress+"."+key+"."
                configRecursion(tembbaseaddress,value)

    edges = {}

    nodes = {}

    current_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(current_dir, 'plan-larger.json')

    with open(file_path) as json_data:
        plan = json.load(json_data)

    configuration = plan['configuration'] # all edges

    configRecursion(None,configuration)

    resource_changes = plan['resource_changes'] # all nodes

    for resource_change in resource_changes:
        #address = resource_change['address'].replace('[0]', '')
        nodes['address'] = resource_change

    for key,value in edges.items():
        #key = key.replace('[0]', '')
        if key in nodes:
            if 'edges' not in nodes[key]:
                nodes[key]['edges'] = set([])
            # print(nodes[key]['edges'] )
            # print(value)
            nodes[key]['edges'].update(value)
        for val in value:
            #val = val.replace('[0]', '')
            if val in nodes:
                if 'edges' not in nodes[val]:
                    nodes[val]['edges'] = set([])
                nodes[val]['edges'].add(key)
        

    # make edges set back into a list
    for key,value in nodes.items():
        if 'edges' in nodes[key]:
            nodes[key]['edges'] = list(nodes[key]['edges'])
        else:
            nodes[key]['edges'] = []
    return jsonify(nodes)

def get_adjacency_list_from_dot():

    current_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(current_dir, 'graphexisting.dot')
    adjacency_list = defaultdict(set)
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
        adjacency_list[sources[1].replace("\"", "").replace("\\","")].add(targets[1].replace("\"", "").replace("\\",""))
    
    for key,value in adjacency_list.items():
        adjacency_list[key] = list(value)
        
    # Save to file in current directory
    output_path = os.path.join(current_dir, 'adjacency_list.json')
    with open(output_path, 'w') as f:
        json.dump(adjacency_list, f, indent=4)
    print(f"Saved adjacency_list to {output_path}")

    return adjacency_list



def load_plan_and_nodes():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(current_dir, 'planexisting-larger.json')
    
    with open(file_path) as json_data:
        plan = json.load(json_data)

    resource_changes = plan['resource_changes'] # all nodes

    nodes = defaultdict(dict)

    for resource_change in resource_changes:
        address = resource_change['address'] # may end with [*]
        path = re.sub(r'\[\d+\]', '', address) # remove [*]
        if "resources" not in nodes[path]:
            nodes[path]["resources"] = {}
        nodes[path]["resources"][resource_change['address']]=resource_change

    output_path = os.path.join(current_dir, 'nodes.json')
    with open(output_path, 'w') as f:
        json.dump(nodes, f, indent=4)
    print(f"Saved nodes to {output_path}")
    return nodes


def build_new_edges(nodes, newedges):
    current_dir = os.path.dirname(os.path.abspath(__file__))

    def traverse_new(headnode,path,visited):
        if path in visited:
            return
        visited.add(path)
        if path in newedges:
            for edge in newedges[path]:
                if edge in nodes:
                    headnode['edges_new'].append(edge)
                elif edge.startswith("provider"): #this technically skips potential connections
                    continue
                else:
                    traverse_new(headnode,edge,visited)                

    #from a node, traverse the adj list, untill dead end or you hit another resource
    for path,node in nodes.items(): # key and map containing list of resources
        node['edges_new'] = []
        visited = set([])
        traverse_new(node,path,visited)

    output_path = os.path.join(current_dir, 'nodes-newedges.json')
    with open(output_path, 'w') as f:
        json.dump(nodes, f, indent=4)
    print(f"Saved nodes to {output_path}")

    # Post-processing: Remove self-references and duplicates
    for address, node in nodes.items():
        unique_edges = set(node['edges_new'])
        if address in unique_edges:
            unique_edges.remove(address)
        node['edges_new'] = list(unique_edges)

    output_path = os.path.join(current_dir, 'nodes-newedges-unique.json')
    with open(output_path, 'w') as f:
        json.dump(nodes, f, indent=4)
    print(f"Saved nodes to {output_path}")

    # Post-processing: Enforce bidirectionality
    # If A -> B, ensure B -> A
    for source, node in nodes.items():
        for target in node['edges_new']:
            if target in nodes:
                target_edges = nodes[target]['edges_new']
                if source not in target_edges:
                    target_edges.append(source)
    output_path = os.path.join(current_dir, 'nodes-newedges-bidirectional.json')
    with open(output_path, 'w') as f:
        json.dump(nodes, f, indent=4)
    print(f"Saved nodes to {output_path}")
    return nodes

def compute_resource_diffs(nodes):
    #create a diff of changes to resources
    for path,mymap in nodes.items(): #key and map containing list of resources and new_edges
        for address,node in mymap["resources"].items():
            node['change']['diff'] = {}

            if node['change']['before'] is None:
                node['change']['before'] = {}
            if node['change']['after'] is None:
                node['change']['after'] = {}

            for key,value in node['change']['before'].items():
                if key not in node['change']['after']:
                    if value is not None:
                        node['change']['diff'][key] = {
                            'before': value,
                            'after': None
                        }
                elif value != node['change']['after'][key]:
                        node['change']['diff'][key] = {
                            'before': value,
                            'after': node['change']['after'][key]
                        }

            for key,value in node['change']['after'].items():
                if key not in node['change']['before']:
                    if value is not None and value != '' and value != [] and value != {}:
                        node['change']['diff'][key] = {
                            'before': None,
                            'after': value
                        }
                elif value != node['change']['before'][key]:
                    node['change']['diff'][key] = {
                        'after': value,
                        'before': node['change']['before'][key]
                    }
    return nodes

def build_existing_edges(nodes):
    current_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(current_dir, 'planexisting-larger.json')
    
    with open(file_path) as json_data:
        plan = json.load(json_data)

    existingedges = defaultdict(set)

    #gets all existing edges via depends_on and adds missing nodes
    def existingeRecursion(module):
        if "resources" in module:
            for resource in module["resources"]:
                path = re.sub(r'\[\d+\]', '', resource['address'])
                if path not in nodes:
                    nodes[path] = {}
                    nodes[path]["resources"] = {}
                if path in nodes and resource['address'] not in nodes[path]["resources"]:
                    resource['change'] = {}
                    resource['change']['actions'] = ['existing']
                    nodes[path]["resources"][resource['address']]=resource
                if "depends_on" in resource:
                    existingedges[path].update(resource["depends_on"])
                    for edge in resource["depends_on"]:
                        existingedges[edge].add(path)
        if "child_modules" in module:
            for module in module["child_modules"]:
                existingeRecursion(module)

    if "prior_state" in plan and "values" in plan["prior_state"] and "root_module" in plan["prior_state"]["values"]:
        existingeRecursion(plan["prior_state"]["values"]["root_module"])

    #print(existingedges)
    print("computed existing edges")
    print("\n\n\n\n")

    for key, value in existingedges.items():
        key = re.sub(r'\[\d+\]', '', key)
        if key in nodes:
            #print(value)
            nodes[key]['edges_existing'] = []
            for val in value:
                if val in nodes:
                    nodes[key]['edges_existing'].append(val)
        for val in value:
            val = re.sub(r'\[\d+\]', '', val)
            if val in nodes:
                if 'edges_existing' not in nodes[val]:
                    nodes[val]['edges_existing'] = []
                if key in nodes:
                    nodes[val]['edges_existing'].append(key)
    return nodes

def ensure_edge_lists(nodes):
    for node in nodes.values():
        if 'edges_new' not in node:
            node['edges_new'] = []
        if 'edges_existing' not in node:
            node['edges_existing'] = []
    return nodes

def delete_orphaned_nodes(nodes):
    duplicate = {}
    for path,resources in nodes.items():
        if resources["edges_existing"] != [] or resources["edges_new"] != []:
            duplicate[path]=resources
    return duplicate




def external_resources(nodes):

    newnodes = {}
    for path,node in nodes.items():
        edges_existing  = node["edges_existing"]
        edges_new = node["edges_new"]
        for edge in edges_existing:
            if edge not in nodes and ".data." not in edge and "aws_iam_role_policy" not in edge:
                print(edge)
                newnodes[edge] = {}
                newnodes[edge]["resources"] = {}
                external_resource = {
                    "address": edge,
                    "type": edge,
                    "change": {
                        "actions": ["external"]
                    }
                }
                newnodes[edge]["resources"][edge]=external_resource
                newnodes[edge]["edges_existing"] = []
                newnodes[edge]["edges_new"] = []
                newnodes[edge]["edges_existing"].append(path)
                newnodes[edge]["edges_new"].append(path)
        
        for edge in edges_new:
            if edge not in nodes:
                newnodes[edge] = {}
                newnodes[edge]["resources"] = {}
                external_resource = {
                    "address": edge,
                    "type": edge,
                    "change": {
                        "actions": ["external"]
                    }
                }
                newnodes[edge]["resources"][edge]=external_resource
                newnodes[edge]["edges_existing"] = []
                newnodes[edge]["edges_new"] = []
                newnodes[edge]["edges_existing"].append(path)
                newnodes[edge]["edges_new"].append(path)
    for key,value in newnodes.items():
        if key not in nodes:
            nodes[key] = value
        else:
            print("key already exists")
            print(key)
            print("\n\n\n\n\n")

    return nodes


def clean_up_role_links(nodes):

    for path, resources in nodes.items():
        if "aws_iam_role_policy" in path or "aws_iam_policy_document" in path:
            edges_existing = [x for x in resources["edges_existing"] if "aws_lambda_function" not in x]
            edges_new = [x for x in resources["edges_new"] if "aws_lambda_function" not in x]
            nodes[path]["edges_existing"] = edges_existing
            nodes[path]["edges_new"] = edges_new
        if "aws_lambda_function" in path:
            edges_existing = [x for x in resources["edges_existing"] if "aws_iam_role_policy"  not in x and "aws_iam_policy_document" not in x ]
            edges_new = [x for x in resources["edges_new"] if "aws_iam_role_policy" not in x and "aws_iam_policy_document" not in x]
            nodes[path]["edges_existing"] = edges_existing
            nodes[path]["edges_new"] = edges_new


    return nodes

            
        



#i want to traverse all nodes in this graph to identify all resources and aws iam policy documents
@app.route('/api/graph2')
def get_graph2():
    # this uses dot to dict script
    try:
        #get edges from dot file
        newedges = get_adjacency_list_from_dot() # edges, no index
        #get nodes from plan with resource changes
        nodes = load_plan_and_nodes() #resource changes nodes, use index, need to remove it

        #print(newedges)
        print("\n\n\n\n\n")
        #print(nodes)
        print("\n\n\n\n\n")


        nodes = build_new_edges(nodes, newedges)
        #print(nodes)
        print("built new edges")
        print("\n\n\n\n\n")
        nodes = compute_resource_diffs(nodes)
        #print(nodes)
        print("computed diffs")
        print("\n\n\n\n\n")
        nodes = build_existing_edges(nodes)
        #print(nodes)
        print("computed existing edges")
        print("\n\n\n\n\n")

        nodes = ensure_edge_lists(nodes)
        #print(nodes)
        print("ensured edge lists")
        print("\n\n\n\n\n")

        nodes =external_resources(nodes)
        #print(nodes)
        print("computed external resources")
        print("\n\n\n\n\n")

        nodes = ensure_edge_lists(nodes)
        #print(nodes)
        print("ensured edge lists")
        print("\n\n\n\n\n")
        nodes = delete_orphaned_nodes(nodes)
        nodes = clean_up_role_links(nodes)
    
        return jsonify(nodes)

    except Exception as e:
        traceback.print_exc()
        return {"error": str(e), "trace": traceback.format_exc()}
    

def get_adjacency_list_from_dot_pydot():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(current_dir, 'graphexisting.dot')

    graphs = pydot.graph_from_dot_file(file_path)
    graph = graphs[0]

    def extract_resource_name(node_id):
        # node_id is like '"[root] aws_s3_bucket.test (expand)"'
        # Match the original parsing: split by space, take index 1, strip quotes/backslashes
        name = node_id.strip()
        parts = name.split(" ")
        if len(parts) >= 2:
            return parts[1].replace('"', '').replace('\\', '')
        return name.replace('"', '').replace('\\', '')

    adjacency_list = defaultdict(set)

    # pydot handles subgraphs — collect edges from all subgraphs recursively
    def collect_edges(g):
        for edge in g.get_edges():
            source = extract_resource_name(edge.get_source())
            target = extract_resource_name(edge.get_destination())
            adjacency_list[source].add(target)
        for subgraph in g.get_subgraphs():
            collect_edges(subgraph)

    collect_edges(graph)

    for key in adjacency_list:
        adjacency_list[key] = list(adjacency_list[key])

    return adjacency_list


def build_new_edges_nx(nodes, newedges):
    # Build a networkx DiGraph from the adjacency list
    G = nx.DiGraph()
    for source, targets in newedges.items():
        for target in targets:
            G.add_edge(source, target)

    resource_nodes = set(nodes.keys())

    # For each resource node, BFS through intermediate (non-resource, non-provider) nodes
    # to find reachable resource nodes
    for path, node in nodes.items():
        node['edges_new'] = []
        if path not in G:
            continue
        # BFS: expand only non-resource, non-provider nodes
        visited = set()
        visited.add(path)
        queue = [path]
        while queue:
            current = queue.pop(0)
            if current not in G:
                continue
            for neighbor in G.successors(current):
                if neighbor in visited:
                    continue
                visited.add(neighbor)
                if neighbor in resource_nodes:
                    node['edges_new'].append(neighbor)
                elif neighbor.startswith("provider"):
                    continue
                else:
                    queue.append(neighbor)

    # Post-processing: Remove self-references and duplicates
    for address, node in nodes.items():
        unique_edges = set(node['edges_new'])
        unique_edges.discard(address)
        node['edges_new'] = list(unique_edges)

    # Post-processing: Enforce bidirectionality — if A -> B, ensure B -> A
    for source, node in nodes.items():
        for target in node['edges_new']:
            if target in nodes:
                target_edges = nodes[target]['edges_new']
                if source not in target_edges:
                    target_edges.append(source)

    return nodes


def build_existing_edges_v2(nodes):
    current_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(current_dir, 'planexisting-larger.json')

    with open(file_path) as json_data:
        plan = json.load(json_data)

    if "prior_state" not in plan or "values" not in plan["prior_state"] or "root_module" not in plan["prior_state"]["values"]:
        return nodes

    existingedges = defaultdict(set)

    # Iterative traversal instead of recursive — no recursion limit risk
    stack = [plan["prior_state"]["values"]["root_module"]]
    while stack:
        module = stack.pop()
        if "resources" in module:
            for resource in module["resources"]:
                path = re.sub(r'\[\d+\]', '', resource['address'])
                if path not in nodes:
                    nodes[path] = {"resources": {}}
                if resource['address'] not in nodes[path]["resources"]:
                    resource['change'] = {'actions': ['existing']}
                    nodes[path]["resources"][resource['address']] = resource
                if "depends_on" in resource:
                    existingedges[path].update(resource["depends_on"])
                    for edge in resource["depends_on"]:
                        existingedges[edge].add(path)
        if "child_modules" in module:
            stack.extend(module["child_modules"])

    # Project onto nodes — same logic as original to preserve edge counts
    for key, value in existingedges.items():
        key = re.sub(r'\[\d+\]', '', key)
        if key in nodes:
            nodes[key]['edges_existing'] = []
            for val in value:
                if val in nodes:
                    nodes[key]['edges_existing'].append(val)
        for val in value:
            val = re.sub(r'\[\d+\]', '', val)
            if val in nodes:
                if 'edges_existing' not in nodes[val]:
                    nodes[val]['edges_existing'] = []
                if key in nodes:
                    nodes[val]['edges_existing'].append(key)

    return nodes


def compute_resource_diffs_v2(nodes):
    for path, mymap in nodes.items():
        for address, node in mymap["resources"].items():
            before = node['change'].get('before') or {}
            after = node['change'].get('after') or {}
            # Mutate to match original behavior (original sets None to {})
            node['change']['before'] = before
            node['change']['after'] = after

            diff = {}
            all_keys = set(before.keys()) | set(after.keys())
            for key in all_keys:
                in_before = key in before
                in_after = key in after
                bval = before.get(key)
                aval = after.get(key)

                if in_before and not in_after:
                    if bval is not None:
                        diff[key] = {'before': bval, 'after': None}
                elif not in_before and in_after:
                    if aval is not None and aval != '' and aval != [] and aval != {}:
                        diff[key] = {'before': None, 'after': aval}
                elif bval != aval:
                    diff[key] = {'before': bval, 'after': aval}

            node['change']['diff'] = diff
    return nodes


def _make_external_node(edge, back_ref):
    return {
        "resources": {
            edge: {
                "address": edge,
                "type": edge,
                "change": {"actions": ["external"]}
            }
        },
        "edges_existing": [back_ref],
        "edges_new": [back_ref],
    }


def external_resources_v2(nodes):
    newnodes = {}
    for path, node in nodes.items():
        for edge in node["edges_existing"]:
            if edge not in nodes and ".data." not in edge and "aws_iam_role_policy" not in edge:
                newnodes[edge] = _make_external_node(edge, path)
        for edge in node["edges_new"]:
            if edge not in nodes:
                newnodes[edge] = _make_external_node(edge, path)

    for key, value in newnodes.items():
        if key not in nodes:
            nodes[key] = value

    return nodes


def delete_orphaned_nodes_v2(nodes):
    return {
        path: node for path, node in nodes.items()
        if node.get("edges_existing") or node.get("edges_new")
    }


EDGE_FILTER_RULES = [
    # (path_contains, edge_must_not_contain)
    ("aws_iam_role_policy", "aws_lambda_function"),
    ("aws_iam_policy_document", "aws_lambda_function"),
    ("aws_lambda_function", "aws_iam_role_policy"),
    ("aws_lambda_function", "aws_iam_policy_document"),
]


def clean_up_role_links_v2(nodes):
    for path, node in nodes.items():
        for path_match, edge_exclude in EDGE_FILTER_RULES:
            if path_match in path:
                node["edges_existing"] = [e for e in node["edges_existing"] if edge_exclude not in e]
                node["edges_new"] = [e for e in node["edges_new"] if edge_exclude not in e]
    return nodes


def build_graph3_nodes():
    """Build the full processed nodes dict (reusable outside the route)."""
    newedges = get_adjacency_list_from_dot_pydot()
    nodes = load_plan_and_nodes()
    nodes = build_new_edges_nx(nodes, newedges)
    nodes = compute_resource_diffs_v2(nodes)
    nodes = build_existing_edges_v2(nodes)
    nodes = ensure_edge_lists(nodes)
    nodes = external_resources_v2(nodes)
    nodes = ensure_edge_lists(nodes)
    nodes = delete_orphaned_nodes_v2(nodes)
    nodes = clean_up_role_links_v2(nodes)
    return nodes


@app.route('/api/graph3')
def get_graph3():
    try:
        nodes = build_graph3_nodes()
        return jsonify(nodes)

    except Exception as e:
        traceback.print_exc()
        return {"error": str(e), "trace": traceback.format_exc()}


@app.route('/api/graph4')
def get_graph4():
    """
    Same as graph3 but enriched with LangGraph analysis per resource.
    Each resource gets an 'enrichment' field: { summary, issues, recommendations }
    plus top-level 'langgraph' with the raw LangGraph output and parsed per-resource JSON.
    Pass ?mock=true to skip all LLM calls and return deterministic canned data.
    """
    try:
        mock = request.args.get("mock", "").lower() in ("true", "1")

        from LangGraph import query_with_langgraph, parse_analysis_to_resources

        if mock:
            import copy
            from LangGraph import MOCK_GRAPH_NODES
            nodes = copy.deepcopy(MOCK_GRAPH_NODES)
        else:
            nodes = build_graph3_nodes()

        resource_paths = list(nodes.keys())

        # Run LangGraph with analysis question
        langgraph_result = query_with_langgraph(
            "Are there any bugs or issues in this Terraform plan? "
            "Analyze each resource. Check for missing event source mappings, IAM gaps, "
            "networking issues, and configuration problems.",
            mock=mock,
        )

        analysis_text = (
            langgraph_result.get("synthesized_answer")
            or langgraph_result.get("final_answer")
            or langgraph_result.get("rag_answer")
            or ""
        )
        sub_answers = langgraph_result.get("sub_answers") or []

        # Parse analysis into per-resource enrichment (JSON)
        enrichment_by_path = parse_analysis_to_resources(
            analysis_text=analysis_text,
            sub_answers=sub_answers,
            resource_paths=resource_paths,
            mock=mock,
        )

        # Enrich each node with llm_analysis
        for path, node_data in nodes.items():
            enrichment = enrichment_by_path.get(path, {})
            node_data["enrichment"] = {
                "summary": enrichment.get("summary", ""),
                "issues": enrichment.get("issues", []),
                "recommendations": enrichment.get("recommendations", []),
            }

        for path,group in nodes.items():
            enrichment = enrichment_by_path.get(path, {})
            nodes[path]["AI"] = {}
            nodes[path]["AI"]["Issues"] = enrichment.get("issues", [])
            nodes[path]["AI"]["Sumary"] = enrichment.get("summary", "")
            nodes[path]["AI"]["Recomendations"] = enrichment.get("recommendations", [])

        return jsonify(nodes)

        """
        return jsonify({
            "nodes": nodes
            "langgraph": {
                "question": langgraph_result.get("question"),
                "route": langgraph_result.get("route"),
                "final_answer": langgraph_result.get("final_answer"),
                "synthesized_answer": langgraph_result.get("synthesized_answer"),
                "sub_questions": langgraph_result.get("sub_questions"),
                "sub_answers": langgraph_result.get("sub_answers"),
                "trace": langgraph_result.get("trace"),
                "enrichment_by_path": enrichment_by_path,
            },
        })
        """
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500



@app.route('/api/query', methods=['POST'])
def query_rag():
    """RAG endpoint — accepts {"question": "..."} and returns an LLM answer."""
    from rag import get_query_engine

    body = request.get_json(silent=True) or {}
    question = body.get("question", "").strip()

    if not question:
        return jsonify({"error": "A 'question' field is required in the JSON body."}), 400

    try:
        engine = get_query_engine()
        response = engine.query(question)
        return jsonify({"question": question, "answer": str(response)})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500


@app.route('/api/query/debug', methods=['POST'])
def query_rag_debug():
    """
    RAG debug endpoint — same as /api/query but returns retrieval trace:
    vector_paths, hop_additions, collected_paths, source_nodes with metadata.
    """
    from rag import get_query_engine, get_graph_retriever

    body = request.get_json(silent=True) or {}
    question = body.get("question", "").strip()

    if not question:
        return jsonify({"error": "A 'question' field is required in the JSON body."}), 400

    try:
        engine = get_query_engine()
        response = engine.query(question)

        graph_retriever = get_graph_retriever()
        retrieval_trace = graph_retriever.last_trace if graph_retriever else None

        source_nodes = []
        if response.source_nodes:
            for nws in response.source_nodes:
                node = nws.node
                source_nodes.append({
                    "id": node.node_id,
                    "score": nws.score,
                    "retrieval_source": node.metadata.get("retrieval_source"),
                    "graph_path": node.metadata.get("graph_path"),
                    "text_preview": (node.text or "")[:200] + "..." if node.text and len(node.text) > 200 else node.text,
                })

        return jsonify({
            "question": question,
            "answer": str(response),
            "retrieval_trace": retrieval_trace,
            "source_nodes": source_nodes,
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500


@app.route('/api/eval', methods=['POST'])
def eval_rag():
    """
    RAG evaluation endpoint — runs Faithfulness and Relevancy evaluators.
    Body: {"question": "..."} — runs query and evaluates the response.
    """
    from rag import get_query_engine, get_evaluators

    body = request.get_json(silent=True) or {}
    question = body.get("question", "").strip()

    if not question:
        return jsonify({"error": "A 'question' field is required in the JSON body."}), 400

    try:
        engine = get_query_engine()
        response = engine.query(question)

        faithfulness_eval, relevancy_eval = get_evaluators()

        faithfulness_result = faithfulness_eval.evaluate_response(
            query=question,
            response=response,
        )
        relevancy_result = relevancy_eval.evaluate_response(
            query=question,
            response=response,
        )

        return jsonify({
            "question": question,
            "answer": str(response),
            "evaluation": {
                "faithfulness": {
                    "passing": faithfulness_result.passing,
                    "feedback": faithfulness_result.feedback,
                    "score": faithfulness_result.score,
                },
                "relevancy": {
                    "passing": relevancy_result.passing,
                    "feedback": relevancy_result.feedback,
                    "score": relevancy_result.score,
                },
            },
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500


@app.route('/api/query/langgraph', methods=['POST'])
def query_langgraph():
    """
    LangGraph-powered RAG endpoint — routing, agentic critique/refine loop, full trace.
    Body: {"question": "...", "mock": true/false}
    Returns: final_answer, route, trace, rag_answer, refined_answer (if refined).
    Pass mock=true to skip real LLM/RAG calls and return deterministic canned responses.
    """
    from LangGraph import query_with_langgraph

    body = request.get_json(silent=True) or {}
    question = body.get("question", "").strip()
    mock = bool(body.get("mock", False))

    if not question:
        return jsonify({"error": "A 'question' field is required in the JSON body."}), 400

    try:
        result = query_with_langgraph(question, mock=mock)
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "trace": traceback.format_exc()}), 500

@app.route('/api/mock')
def get_mock_response():
    """Read and return mock.json."""
    current_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(current_dir, 'mock.json')
    with open(file_path) as f:
        data = json.load(f)
    return jsonify(data)


if __name__ == '__main__':
    app.run(debug=True, port=8000)
