from flask import Flask, jsonify
from flask_cors import CORS
from terraformPlan import TerraformPlan
import json
from pprint import pprint

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
    plan, error = TerraformPlan.from_file(['plan-large.json', '../plan-large.json'])

    edges = {}

    configuration = plan.configuration

    plan = None

    with open('plan-large.json') as json_data:
        plan = json.load(json_data)

    configuration = plan['configuration'] # all edges

    resource_changes = plan['resource_changes'] # all nodes

    print(plan)
    return jsonify(plan)



def configRecursion(baseaddress,module):
    if "root_module" in module:
        #we are at the root module
        for resource in module['root_module']['resources']:
            #address is current
            #expressioons <parameter> refferences is parent
            address = resource['address']
            expressions = resource['expressions']
            for key,value in expressions.items():
                if refferences in value:
                    for ref in value['references']:
                        if ref not in edges:
                            edges[ref] = []
                            if baseaddress is None:
                                edges[ref].append(address)
                            else:
                                edges[ref].append(baseaddress+"."+address)
        
    if "module" in module:
        #we are at the root module
        for resource in module['module']['resources']:
            #address is current
            #expressioons <parameter> refferences is parent
            address = resource['address']
            expressions = resource['expressions']
            for key,value in expressions.items():
                if refferences in value:
                    for ref in value['references']:
                        if ref not in edges:
                            edges[ref] = []
                            if baseaddress is None:
                                edges[ref].append(address)
                            else:
                                edges[ref].append(baseaddress+"."+address)
    
        if "module_calls" in module:
            if baseaddress is None:
                baseaddress = "module."
            else:
                baseaddress = baseaddress+"module"
            for key,value in module['module_calls'].items():
                tembbaseaddress = baseaddress+"."+key+"."
                configRecursion(tembbaseaddress,value)
                

                        

            

            

    

if __name__ == '__main__':
    app.run(debug=True, port=8000)
