from flask import Flask, jsonify
from flask_cors import CORS
from terraformPlan import TerraformPlan
import json
from pprint import pprint
import os

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
                            if ref not in edges:
                                edges[ref] = []
                            if baseaddress is None:
                                edges[ref].append(address)
                            else:
                                edges[ref].append(baseaddress+"."+address)
            
        
        if "module_calls" in module[mystr]:
            if baseaddress is None:
                baseaddress = "module"
            else:
                baseaddress = baseaddress+"module"
            for key,value in module[mystr]['module_calls'].items():
                tembbaseaddress = baseaddress+"."+key+"."
                configRecursion(tembbaseaddress,value)

    edges = {}

    current_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(current_dir, 'plan-large.json')

    with open(file_path) as json_data:
        plan = json.load(json_data)

    configuration = plan['configuration'] # all edges

    configRecursion(None,configuration)

    print(edges)

    resource_changes = plan['resource_changes'] # all nodes

    #rint(plan)
    return jsonify(plan)
    

if __name__ == '__main__':
    app.run(debug=True, port=8000)
