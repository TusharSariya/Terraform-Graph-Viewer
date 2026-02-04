from flask import Flask, jsonify
from flask_cors import CORS
from terraformPlan import TerraformPlan
import json
from pprint import pprint
import os
from collections import defaultdict
import traceback
from deepdiff import DeepDiff


app = Flask(__name__)
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
        address = resource_change['address'].replace('[0]', '')
        nodes[address] = resource_change

    for key,value in edges.items():
        key = key.replace('[0]', '')
        if key in nodes:
            if 'edges' not in nodes[key]:
                nodes[key]['edges'] = set([])
            # print(nodes[key]['edges'] )
            # print(value)
            nodes[key]['edges'].update(value)
        for val in value:
            val = val.replace('[0]', '')
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

#i want to traverse all nodes in this graph to identify all resources and aws iam policy documents
@app.route('/api/graph2')
def get_graph2():
    # this uses dot to dict script
    adjacency_list = defaultdict(set) #all edges
    
    current_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(current_dir, 'graphexisting.dot')
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
            adjacency_list[sources[1].replace("\"", "").replace("\\","")].add(targets[1].replace("\"", "").replace("\\",""))
        
        for key,value in adjacency_list.items():
            adjacency_list[key] = list(value)
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e), "trace": traceback.format_exc()}
                
    current_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(current_dir, 'planexisting-larger.json')

    try:
        with open(file_path) as json_data:
            plan = json.load(json_data)

        resource_changes = plan['resource_changes'] # all nodes

        nodes = defaultdict(dict)

        for resource_change in resource_changes:
            address = resource_change['address'].replace('[0]', '')
            nodes[address] = resource_change


        def traverse(headnode,address,visited):
            if address in visited:
                return
            visited.add(address)
            if address in adjacency_list:
                for edge in adjacency_list[address]:
                    if edge in nodes:
                        headnode['edges'].append(edge)
                    elif edge.startswith("provider"): #this technically skips potential connections
                        continue
                    else:
                        traverse(headnode,edge,visited)                

        #from a node, traverse the adj list, untill dead end or you hit another resource
        for address,node in nodes.items():
            headnode = node
            node['edges'] = []
            visited = set([])
            traverse(headnode,address,visited)

        # Post-processing: Remove self-references and duplicates
        for address, node in nodes.items():
            unique_edges = set(node['edges'])
            if address in unique_edges:
                unique_edges.remove(address)
            node['edges'] = list(unique_edges)

        # Post-processing: Enforce bidirectionality
        # If A -> B, ensure B -> A
        for source, node in nodes.items():
            for target in node['edges']:
                if target in nodes:
                    target_edges = nodes[target]['edges']
                    if source not in target_edges:
                        target_edges.append(source)

        for address,node in nodes.items():
            node['change']['diff'] = {}

            if node['change']['before'] is None:
                node['change']['before'] = {}
            if node['change']['after'] is None:
                node['change']['after'] = {}

            for key,value in node['change']['before'].items():
                if key not in node['change']['after']:
                    node['change']['diff'][key] = {
                        'before': value,
                        'after': None
                    }
                else:
                    if value != node['change']['after'][key]:
                        node['change']['diff'][key] = {
                            'before': value,
                            'after': node['change']['after'][key]
                        }

            for key,value in node['change']['after'].items():
                if key not in node['change']['before']:
                    node['change']['diff'][key] = {
                        'before': None,
                        'after': value
                    }
                else:
                    if value != node['change']['before'][key]:
                        node['change']['diff'][key] = {
                            'after': value,
                            'before': node['change']['before'][key]
                        }
    
        return jsonify(nodes)

    except Exception as e:
        traceback.print_exc()
        return {"error": str(e), "trace": traceback.format_exc()}
    

if __name__ == '__main__':
    app.run(debug=True, port=8000)
