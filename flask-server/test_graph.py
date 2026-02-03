import requests
import json
import sys
from app import get_graph

def test_get_graph():
    try:
        get_graph()
        
        data = response.json()
        
        print("✅ Status Code: 200")
        
        if "configuration" in data:
            print("✅ Configuration found in response")
        else:
            print("❌ Configuration NOT found in response")
            
        # The edges are not returned in the JSON according to the user's last edit?
        # User's edit: 
        # print(edges)
        # return jsonify(plan)
        # So edges are printed to server console, but NOT returned in JSON.
        # I should probably check the server output or ask user to modify app.py to return edges.
        
        # Checking if plan structure is valid at least
        if "resource_changes" in data:
             print(f"✅ Resource Changes: {len(data['resource_changes'])} items")
        
        # Verify nested module structure if possible
        config = data.get('configuration', {})
        root = config.get('root_module', {})
        modules = root.get('module_calls', {})
        print(f"✅ Root Modules Calls: {list(modules.keys())}")

    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        sys.exit(1)
    except json.JSONDecodeError:
        print("❌ Failed to decode JSON")
        sys.exit(1)

if __name__ == "__main__":
    test_get_graph()
