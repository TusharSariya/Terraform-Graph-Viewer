from flask import Flask, jsonify
from flask_cors import CORS
import json
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
    try:
        file_path = 'plan.json'
        if not os.path.exists(file_path):
            file_path = '../plan.json'
        
        if os.path.exists(file_path):
            with open(file_path, 'r') as f:
                return jsonify(json.load(f))
        else:
            return jsonify({"error": "plan.json not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=8000)
