from flask import Flask, jsonify
from flask_cors import CORS
from terraformPlan import TerraformPlan

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
    plan, error = TerraformPlan.from_file(['plan.json', '../plan.json'])
    
    if plan:
        return jsonify(plan.to_dict())
    else:
        return jsonify({"error": error}), 500

if __name__ == '__main__':
    app.run(debug=True, port=8000)
