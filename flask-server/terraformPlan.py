import json
import os

class Resource:
    def __init__(self, data):
        self.address = data.get('address')
        self.mode = data.get('mode')
        self.type = data.get('type')
        self.name = data.get('name')
        self.provider_name = data.get('provider_name')
        self.values = data.get('values', {})

    def to_dict(self):
        return {
            "address": self.address,
            "mode": self.mode,
            "type": self.type,
            "name": self.name,
            "values": self.values
        }

class ResourceChange:
    def __init__(self, data):
        self.address = data.get('address')
        self.mode = data.get('mode')
        self.type = data.get('type')
        self.name = data.get('name')
        self.provider_name = data.get('provider_name')
        self.change = data.get('change', {})
        self.actions = self.change.get('actions', [])
        self.before = self.change.get('before')
        self.after = self.change.get('after')

    def to_dict(self):
        return {
            "address": self.address,
            "mode": self.mode,
            "type": self.type,
            "name": self.name,
            "actions": self.actions,
            "before": self.before,
            "after": self.after
        }

class ConfigResource:
    def __init__(self, data):
        self.address = data.get('address')
        self.mode = data.get('mode')
        self.type = data.get('type')
        self.name = data.get('name')
        self.provider_config_key = data.get('provider_config_key')
        self.expressions = data.get('expressions', {})

    def to_dict(self):
        return {
            "address": self.address,
            "mode": self.mode,
            "type": self.type,
            "name": self.name,
            "provider_config_key": self.provider_config_key,
            "expressions": self.expressions
        }

class Module:
    def __init__(self, data):
        self.address = data.get('address')
        # Recursively create Child Modules
        self.child_modules = [Module(m) for m in data.get('child_modules', [])]
        # Create Resources for this module
        self.resources = [Resource(r) for r in data.get('resources', [])]

    def to_dict(self):
        return {
            "address": self.address,
            "child_modules": [m.to_dict() for m in self.child_modules],
            "resources": [r.to_dict() for r in self.resources]
        }

class PlannedValues:
    def __init__(self, data):
        # planned_values contains a "root_module"
        self.root_module = Module(data.get('root_module', {}))

    def to_dict(self):
        return {
            "root_module": self.root_module.to_dict()
        }

class ConfigModule:
    def __init__(self, data):
        self.resources = [ConfigResource(r) for r in data.get('resources', [])]

    def to_dict(self):
        return {
            "resources": [r.to_dict() for r in self.resources]
        }

class Configuration:
    def __init__(self, data):
        self.provider_config = data.get('provider_config', {})
        self.root_module = ConfigModule(data.get('root_module', {}))

    def to_dict(self):
        return {
            "provider_config": self.provider_config,
            "root_module": self.root_module.to_dict()
        }

class TerraformPlan:
    def __init__(self, data):
        self.format_version = data.get('format_version')
        self.terraform_version = data.get('terraform_version')
        # Pass the dictionary to PlannedValues class
        self.planned_values = PlannedValues(data.get('planned_values', {}))
        self.resource_changes = [ResourceChange(rc) for rc in data.get('resource_changes', [])]
        self.configuration = Configuration(data.get('configuration', {}))
    
    @classmethod
    def from_file(cls, paths):
        for path in paths:
            if os.path.exists(path):
                try:
                    with open(path, 'r') as f:
                        data = json.load(f)
                        return cls(data), None
                except Exception as e:
                    return None, str(e)
        return None, "File not found in paths: " + ", ".join(paths)

    def to_dict(self):
        return {
            "format_version": self.format_version,
            "terraform_version": self.terraform_version,
            "planned_values": self.planned_values.to_dict(),
            "resource_changes": [rc.to_dict() for rc in self.resource_changes],
            "configuration": self.configuration.to_dict()
        }
