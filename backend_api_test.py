import unittest
import requests
import json
import time
import os
import sys
from datetime import datetime
import asyncio

# Get the backend URL from the frontend .env file
def get_backend_url():
    with open('/app/frontend/.env', 'r') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                return line.strip().split('=')[1].strip('"\'')
    return None

class BackendApiTest:
    """Test class for the Chrome extension backend functionality"""
    
    def __init__(self):
        self.backend_url = get_backend_url()
        if not self.backend_url:
            print("❌ Could not find REACT_APP_BACKEND_URL in frontend/.env")
            sys.exit(1)
        
        self.api_url = f"{self.backend_url}/api"
    
    def test_server_running(self):
        """Test if the backend server is running"""
        try:
            response = requests.get(f"{self.api_url}/", timeout=5)
            if response.status_code == 200:
                print(f"✅ Backend server is running at {self.api_url}/")
                print(f"Response: {response.json()}")
                return True
            else:
                print(f"❌ Backend server returned status code {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            print(f"❌ Could not connect to backend server: {e}")
            return False
    
    def test_api_endpoints(self):
        """Test the API endpoints"""
        # Test GET /api/
        try:
            response = requests.get(f"{self.api_url}/", timeout=5)
            if response.status_code == 200:
                print(f"✅ GET {self.api_url}/ - Success")
                print(f"Response: {response.json()}")
            else:
                print(f"❌ GET {self.api_url}/ - Failed with status code {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            print(f"❌ GET {self.api_url}/ - Request failed: {e}")
            return False
        
        # Test POST /api/status
        try:
            data = {"client_name": f"Test Client {datetime.now().isoformat()}"}
            response = requests.post(f"{self.api_url}/status", json=data, timeout=5)
            if response.status_code == 200:
                print(f"✅ POST {self.api_url}/status - Success")
                print(f"Response: {response.json()}")
                status_id = response.json().get('id')
            else:
                print(f"❌ POST {self.api_url}/status - Failed with status code {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            print(f"❌ POST {self.api_url}/status - Request failed: {e}")
            return False
        
        # Test GET /api/status
        try:
            response = requests.get(f"{self.api_url}/status", timeout=5)
            if response.status_code == 200:
                print(f"✅ GET {self.api_url}/status - Success")
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
                print(f"❌ GET {self.api_url}/status - Failed with status code {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            print(f"❌ GET {self.api_url}/status - Request failed: {e}")
            return False
        
        return True
    
    def test_mongodb_connection(self):
        """Test the MongoDB connection"""
        # We'll test this by creating a status check and then retrieving it
        try:
            # Create a status check
            data = {"client_name": f"MongoDB Test {datetime.now().isoformat()}"}
            response = requests.post(f"{self.api_url}/status", json=data, timeout=5)
            if response.status_code != 200:
                print(f"❌ MongoDB connection test failed - Could not create status check")
                return False
            
            status_id = response.json().get('id')
            
            # Retrieve all status checks
            response = requests.get(f"{self.api_url}/status", timeout=5)
            if response.status_code != 200:
                print(f"❌ MongoDB connection test failed - Could not retrieve status checks")
                return False
            
            # Verify our test status check is in the response
            status_checks = response.json()
            found = any(check.get('id') == status_id for check in status_checks)
            if found:
                print(f"✅ MongoDB connection is working properly - Successfully created and retrieved status check")
                return True
            else:
                print(f"❌ MongoDB connection test failed - Could not find created status check")
                return False
        except requests.exceptions.RequestException as e:
            print(f"❌ MongoDB connection test failed: {e}")
            return False
    
    def test_smart_idle_detection(self):
        """Test the smart idle detection functionality"""
        try:
            # Create a status check with idle state data
            idle_state = {
                "client_name": f"Idle Test {datetime.now().isoformat()}",
                "idle_data": {
                    "isIdle": False,
                    "lastActivity": int(time.time() * 1000),
                    "mouseMovement": True,
                    "keyPress": True,
                    "scrolling": True,
                    "videoPlaying": True,
                    "audioPlaying": True,
                    "tabFocused": True,
                    "timeSinceLastActivity": 0
                }
            }
            response = requests.post(f"{self.api_url}/status", json=idle_state, timeout=5)
            if response.status_code == 200:
                print(f"✅ Smart idle detection test - Successfully sent idle state data")
                return True
            else:
                print(f"❌ Smart idle detection test failed - Status code {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            print(f"❌ Smart idle detection test failed: {e}")
            return False
    
    def test_saved_time_structure(self):
        """Test the saved time data structure"""
        try:
            # Create a status check with saved time data
            saved_time_data = {
                "client_name": f"Saved Time Test {datetime.now().isoformat()}",
                "daily_stats": {
                    "today": {
                        "totalTime": 3600,  # 1 hour in seconds
                        "sites": {
                            "example.com": 1800,  # 30 minutes in seconds
                            "google.com": 1800    # 30 minutes in seconds
                        },
                        "savedTime": 7200  # 2 hours in seconds
                    }
                }
            }
            response = requests.post(f"{self.api_url}/status", json=saved_time_data, timeout=5)
            if response.status_code == 200:
                print(f"✅ Saved time structure test - Successfully sent saved time data")
                return True
            else:
                print(f"❌ Saved time structure test failed - Status code {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            print(f"❌ Saved time structure test failed: {e}")
            return False
    
    def test_every_second_tracking(self):
        """Test the every-second tracking functionality"""
        try:
            # Create a status check with tracking data
            tracking_data = {
                "client_name": f"Every-Second Tracking Test {datetime.now().isoformat()}",
                "tracking_data": {
                    "activeTabId": 12345,
                    "tabStartTimes": {
                        "12345": int(time.time() * 1000) - 1000  # 1 second ago
                    },
                    "screenTimeSeconds": 1,
                    "savedTimeSeconds": 1
                }
            }
            response = requests.post(f"{self.api_url}/status", json=tracking_data, timeout=5)
            if response.status_code == 200:
                print(f"✅ Every-second tracking test - Successfully sent tracking data")
                return True
            else:
                print(f"❌ Every-second tracking test failed - Status code {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            print(f"❌ Every-second tracking test failed: {e}")
            return False
    
    def test_backend_logs(self):
        """Check for errors in the backend logs"""
        try:
            # Get the last 100 lines of the backend log
            import subprocess
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
    
    def run_all_tests(self):
        """Run all tests"""
        print("=" * 50)
        print("TESTING CHROME EXTENSION BACKEND")
        print("=" * 50)
        
        # Test if the server is running
        print("\n" + "=" * 50)
        print("TESTING SERVER STATUS")
        print("=" * 50)
        server_running = self.test_server_running()
        if not server_running:
            print("❌ Backend server is not running. Exiting tests.")
            return False
        
        # Test API endpoints
        print("\n" + "=" * 50)
        print("TESTING API ENDPOINTS")
        print("=" * 50)
        endpoints_working = self.test_api_endpoints()
        if not endpoints_working:
            print("❌ API endpoints test failed.")
            return False
        
        # Test MongoDB connection
        print("\n" + "=" * 50)
        print("TESTING MONGODB CONNECTION")
        print("=" * 50)
        mongodb_working = self.test_mongodb_connection()
        if not mongodb_working:
            print("❌ MongoDB connection test failed.")
            return False
        
        # Test smart idle detection
        print("\n" + "=" * 50)
        print("TESTING SMART IDLE DETECTION")
        print("=" * 50)
        idle_detection_working = self.test_smart_idle_detection()
        if not idle_detection_working:
            print("❌ Smart idle detection test failed.")
            return False
        
        # Test saved time structure
        print("\n" + "=" * 50)
        print("TESTING SAVED TIME STRUCTURE")
        print("=" * 50)
        saved_time_working = self.test_saved_time_structure()
        if not saved_time_working:
            print("❌ Saved time structure test failed.")
            return False
        
        # Test every-second tracking
        print("\n" + "=" * 50)
        print("TESTING EVERY-SECOND TRACKING")
        print("=" * 50)
        tracking_working = self.test_every_second_tracking()
        if not tracking_working:
            print("❌ Every-second tracking test failed.")
            return False
        
        # Check backend logs
        print("\n" + "=" * 50)
        print("CHECKING BACKEND LOGS")
        print("=" * 50)
        logs_ok = self.test_backend_logs()
        
        # Overall result
        if (server_running and endpoints_working and mongodb_working and 
            idle_detection_working and saved_time_working and tracking_working and logs_ok):
            print("\n" + "=" * 50)
            print("✅ ALL BACKEND TESTS PASSED")
            print("=" * 50)
            return True
        else:
            print("\n" + "=" * 50)
            print("❌ SOME BACKEND TESTS FAILED")
            print("=" * 50)
            return False

if __name__ == "__main__":
    tester = BackendApiTest()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)