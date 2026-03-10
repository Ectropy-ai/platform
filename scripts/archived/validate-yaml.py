import yaml
import sys
import json

def validate_file(filepath):
    try:
        with open(filepath, 'r') as f:
            yaml.safe_load(f)
        return {"file": filepath, "valid": True}
    except yaml.YAMLError as e:
        return {
            "file": filepath,
            "valid": False,
            "line": e.problem_mark.line if hasattr(e, 'problem_mark') else -1,
            "column": e.problem_mark.column if hasattr(e, 'problem_mark') else -1,
            "error": str(e)
        }

workflows = [
    '.github/workflows/dependency-health.yml',
    '.github/workflows/deploy-staging.yml',
    '.github/workflows/devcontainer-validation.yml',
    '.github/workflows/enterprise-ci.yml',
    '.github/workflows/mcp-index.yml',
    '.github/workflows/production-workflow.yml',
    '.github/workflows/security-enhanced.yml',
    '.github/workflows/staging-workflow.yml'
]

errors = []
for wf in workflows:
    result = validate_file(wf)
    if not result["valid"]:
        errors.append(result)
        
print(json.dumps(errors, indent=2))
sys.exit(len(errors))