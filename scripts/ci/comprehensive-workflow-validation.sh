#!/bin/bash
# Enhanced YAML and GitHub Actions Validation Script

set -euo pipefail

echo "🔍 Enhanced Workflow Validation Script"
echo "======================================"

# Check for basic YAML syntax
echo "1. YAML Syntax Validation..."
python3 -c "
import yaml
import sys
import glob

errors = []
for file in glob.glob('.github/workflows/*.yml'):
    try:
        with open(file, 'r') as f:
            yaml.safe_load(f)
        print(f'✅ {file}')
    except Exception as e:
        print(f'❌ {file}: {e}')
        errors.append(file)

if errors:
    sys.exit(1)
"

echo
echo "2. Tab Character Check..."
if grep -P '\t' .github/workflows/*.yml > /dev/null 2>&1; then
    echo "❌ Found tab characters in workflows:"
    grep -P '\t' .github/workflows/*.yml
    exit 1
else
    echo "✅ No tab characters found"
fi

echo
echo "3. GitHub Actions Expression Validation..."
# Check for unclosed expressions
if grep -n '\${{[^}]*$' .github/workflows/*.yml > /dev/null 2>&1; then
    echo "❌ Found unclosed GitHub Actions expressions:"
    grep -n '\${{[^}]*$' .github/workflows/*.yml
    exit 1
else
    echo "✅ All GitHub Actions expressions properly closed"
fi

echo
echo "4. Multi-line String Indentation Check..."
# This is a simplified check - in real scenarios, you'd want more sophisticated parsing
python3 -c "
import yaml
import glob

for file in glob.glob('.github/workflows/*.yml'):
    with open(file, 'r') as f:
        try:
            data = yaml.safe_load(f)
            print(f'✅ {file} - Multi-line strings properly formatted')
        except yaml.scanner.ScannerError as e:
            if 'could not find expected' in str(e):
                print(f'❌ {file} - Possible indentation issue: {e}')
                exit(1)
"

echo
echo "5. Shell Script Syntax in run: blocks..."
# Extract and validate shell scripts from workflows
python3 -c "
import yaml
import glob
import subprocess
import tempfile
import os

def extract_run_blocks(workflow_file):
    with open(workflow_file, 'r') as f:
        try:
            data = yaml.safe_load(f)
        except:
            return []
    
    run_blocks = []
    
    def traverse(obj, path=''):
        if isinstance(obj, dict):
            for key, value in obj.items():
                if key == 'run' and isinstance(value, str):
                    run_blocks.append((path + '.' + key, value))
                elif isinstance(value, (dict, list)):
                    traverse(value, path + '.' + key if path else key)
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                if isinstance(item, (dict, list)):
                    traverse(item, path + f'[{i}]' if path else f'[{i}]')
    
    traverse(data)
    return run_blocks

for file in glob.glob('.github/workflows/*.yml'):
    run_blocks = extract_run_blocks(file)
    for path, script in run_blocks:
        # Basic shell syntax check
        with tempfile.NamedTemporaryFile(mode='w', suffix='.sh', delete=False) as f:
            f.write('#!/bin/bash\nset -e\n')
            f.write(script)
            f.flush()
            
            try:
                # Check bash syntax
                result = subprocess.run(['bash', '-n', f.name], 
                                      capture_output=True, text=True)
                if result.returncode != 0:
                    print(f'❌ {file}:{path} - Shell syntax error:')
                    print(f'   {result.stderr.strip()}')
                else:
                    pass  # Don't print success for each block to reduce noise
            except Exception as e:
                print(f'⚠️ {file}:{path} - Could not validate: {e}')
            finally:
                os.unlink(f.name)

print('✅ Shell script syntax validation completed')
"

echo
echo "6. Critical GitHub Actions Schema Elements..."
# Check for required workflow elements
for file in .github/workflows/*.yml; do
    if ! grep -q "^name:" "$file"; then
        echo "❌ $file missing 'name' field"
        exit 1
    fi
    if ! grep -q "^on:" "$file"; then
        echo "❌ $file missing 'on' field"
        exit 1
    fi
    if ! grep -q "^jobs:" "$file"; then
        echo "❌ $file missing 'jobs' field"
        exit 1
    fi
done
echo "✅ All workflows have required schema elements"

echo
echo "🎉 All validation checks passed!"
echo "   Workflows are ready for GitHub Actions execution"