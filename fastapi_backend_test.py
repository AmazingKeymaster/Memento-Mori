import requests
import json
import time
import os
import subprocess
import sys
from datetime import datetime

# Get the backend URL from the frontend .env file
def get_backend_url():
    with open('/app/frontend/.env', 'r') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                return line.strip().split('=')[1].strip('"\'')
    return None

# Check if the backend server is running
def check_server_running():
    backend_url = get_backend_url()
    if not backend_url:
        print("❌ Could not find REACT_APP_BACKEND_URL in frontend/.env")
        return False
    
    try:
        # Check the root endpoint with /api prefix
        response = requests.get(f"{backend_url}/api/", timeout=5)
        if response.status_code == 200:
            print(f"✅ Backend server is running at {backend_url}/api/")
            print(f"Response: {response.json()}")
            return True
        else:
            print(f"❌ Backend server returned status code {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ Could not connect to backend server: {e}")
        return False

# Test the API endpoints
def test_api_endpoints():
    backend_url = get_backend_url()
    if not backend_url:
        print("❌ Could not find REACT_APP_BACKEND_URL in frontend/.env")
        return False
    
    api_url = f"{backend_url}/api"
    
    # Test GET /api/
    try:
        response = requests.get(f"{api_url}/", timeout=5)
        if response.status_code == 200:
            print(f"✅ GET {api_url}/ - Success")
            print(f"Response: {response.json()}")
        else:
            print(f"❌ GET {api_url}/ - Failed with status code {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ GET {api_url}/ - Request failed: {e}")
        return False
    
    # Test POST /api/status
    try:
        data = {"client_name": f"Test Client {datetime.now().isoformat()}"}
        response = requests.post(f"{api_url}/status", json=data, timeout=5)
        if response.status_code == 200:
            print(f"✅ POST {api_url}/status - Success")
            print(f"Response: {response.json()}")
            status_id = response.json().get('id')
        else:
            print(f"❌ POST {api_url}/status - Failed with status code {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ POST {api_url}/status - Request failed: {e}")
        return False
    
    # Test GET /api/status
    try:
        response = requests.get(f"{api_url}/status", timeout=5)
        if response.status_code == 200:
            print(f"✅ GET {api_url}/status - Success")
            status_checks = response.json()
            print(f"Found {len(status_checks)} status checks")
            
            # Verify our test status check is in the response
            if status_id:
                found = any(check.get('id') == status_id for check in status_checks)
                if found:
                    print(f"✅ Successfully found our test status check with ID {status_id}")
                else:
                    print(f"❌ Could not find our test status check with ID {status_id}")
                    return False
        else:
            print(f"❌ GET {api_url}/status - Failed with status code {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ GET {api_url}/status - Request failed: {e}")
        return False
    
    return True

# Check for errors in the backend logs
def check_backend_logs():
    try:
        # Get the last 100 lines of the backend log
        result = subprocess.run(
            ["tail", "-n", "100", "/var/log/supervisor/backend.*.log"], 
            capture_output=True, 
            text=True
        )
        
        log_content = result.stdout
        
        # Check for error messages
        error_keywords = ["ERROR", "Exception", "Failed", "Traceback", "ConnectionError"]
        errors_found = False
        
        for line in log_content.split('\n'):
            for keyword in error_keywords:
                if keyword in line:
                    print(f"❌ Error found in backend logs: {line}")
                    errors_found = True
        
        if not errors_found:
            print("✅ No errors found in backend logs")
            return True
        return False
    except Exception as e:
        print(f"❌ Failed to check backend logs: {e}")
        return False

# Run all tests
def run_tests():
    print("=" * 50)
    print("TESTING MEMENTO MORI CHROME EXTENSION BACKEND")
    print("=" * 50)
    
    # Check if the server is running
    server_running = check_server_running()
    if not server_running:
        print("❌ Backend server is not running. Exiting tests.")
        return False
    
    print("\n" + "=" * 50)
    print("TESTING API ENDPOINTS")
    print("=" * 50)
    
    # Test API endpoints
    endpoints_working = test_api_endpoints()
    if not endpoints_working:
        print("❌ API endpoints test failed.")
        return False
    
    print("\n" + "=" * 50)
    print("CHECKING BACKEND LOGS")
    print("=" * 50)
    
    # Check backend logs
    logs_ok = check_backend_logs()
    
    # Overall result
    if server_running and endpoints_working and logs_ok:
        print("\n" + "=" * 50)
        print("✅ ALL TESTS PASSED")
        print("=" * 50)
        return True
    else:
        print("\n" + "=" * 50)
        print("❌ SOME TESTS FAILED")
        print("=" * 50)
        return False

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)