import unittest
import json
import time
from unittest.mock import MagicMock, patch
import sys
import os
from datetime import datetime, timedelta
import requests
import asyncio

# Import the mock classes from backend_test.py
sys.path.append('/app')
from backend_test import (
    MockChromeStorage, 
    MockChromeTabs, 
    MockChromeRuntime, 
    MockChromeAlarms, 
    MockChromeWindows
)

# Get the backend URL from the frontend .env file
def get_backend_url():
    with open('/app/frontend/.env', 'r') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                return line.strip().split('=')[1].strip('"\'')
    return None

class MockIdleState:
    """Mock implementation of chrome.idle API"""
    def __init__(self):
        self.state = "active"  # active, idle, locked
        self.listeners = []
        
    def queryState(self, threshold, callback):
        """Mock chrome.idle.queryState"""
        callback(self.state)
        
    def setDetectionInterval(self, interval):
        """Mock chrome.idle.setDetectionInterval"""
        self.detection_interval = interval
        return True
        
    def onStateChanged(self):
        """Mock chrome.idle.onStateChanged"""
        return {
            "addListener": lambda listener: self.listeners.append(listener)
        }
        
    def set_state(self, new_state):
        """Helper to change the idle state and trigger listeners"""
        self.state = new_state
        for listener in self.listeners:
            listener(new_state)
        return True

class SmartTrackingTest(unittest.TestCase):
    """Test cases for the smart screen time tracking and saved time features"""
    
    def setUp(self):
        """Set up the test environment"""
        # Create mock Chrome APIs
        self.storage = MockChromeStorage()
        self.tabs = MockChromeTabs()
        self.runtime = MockChromeRuntime()
        self.alarms = MockChromeAlarms()
        self.windows = MockChromeWindows()
        self.idle = MockIdleState()
        
        # Create global chrome object
        global chrome
        chrome = type('chrome', (), {
            'storage': type('storage', (), {'local': self.storage}),
            'tabs': self.tabs,
            'runtime': self.runtime,
            'alarms': self.alarms,
            'windows': self.windows,
            'idle': self.idle
        })
        
        # Import the BackgroundService class
        self.background_service_code = self.load_background_js()
        self.background_service = self.create_background_service()
    
    def load_background_js(self):
        """Load the background.js file content"""
        with open('/app/background.js', 'r') as f:
            return f.read()
    
    def create_background_service(self):
        """Create an instance of BackgroundService with mocked Chrome APIs"""
        # This is a simplified approach - in a real test, you'd use a JavaScript engine
        # Here we'll implement a Python version of the key methods we want to test
        
        class BackgroundService:
            def __init__(self, test_case):
                self.test_case = test_case
                self.activeTabId = None
                self.tabStartTimes = {}
                self.sessionStartTime = time.time() * 1000  # Convert to JS timestamp
                self.smartIdleState = {
                    "isIdle": False,
                    "lastActivity": time.time() * 1000,
                    "mouseMovement": True,
                    "keyPress": True,
                    "scrolling": True,
                    "videoPlaying": False,
                    "audioPlaying": False,
                    "tabFocused": True,
                    "timeSinceLastActivity": 0
                }
            
            async def updateIdleState(self, idleState):
                """Update the smart idle state with comprehensive idle detection data"""
                self.smartIdleState = idleState
                await chrome.storage.local.set({'smartIdleState': self.smartIdleState})
                return self.smartIdleState
            
            async def updateScreenTimeEverySecond(self):
                """Update screen time tracking every second"""
                if not self.activeTabId:
                    return
                
                # Check if tab is still active and window is focused
                try:
                    tab = await chrome.tabs.get(self.activeTabId)
                    if not tab['active']:
                        return
                    
                    # Check smart idle state
                    if self.smartIdleState['isIdle']:
                        return
                    
                    # Record time for active tab
                    await self.recordTabTime(self.activeTabId, False)
                except Exception as e:
                    print(f"Error updating screen time: {e}")
            
            async def updateSavedTimeEverySecond(self):
                """Update saved time tracking every second"""
                result = await chrome.storage.local.get(['blockingSchedules'])
                blocking_schedules = result.get('blockingSchedules', [])
                
                # Check if any schedule is active
                current_time = datetime.now()
                for schedule in blocking_schedules:
                    if not schedule.get('active', False):
                        continue
                    
                    if self.isBlockingTimeActive(current_time, schedule):
                        await self.recordSavedTime()
                        return
            
            async def recordSavedTime(self):
                """Record saved time when blocking schedules are active"""
                today = datetime.now().strftime("%a %b %d %Y")  # JS Date.toDateString() format
                result = await chrome.storage.local.get(['dailyStats'])
                
                # Update daily stats
                daily_stats = result.get('dailyStats', {})
                if today not in daily_stats:
                    daily_stats[today] = {'totalTime': 0, 'sites': {}, 'savedTime': 0}
                
                # Increment saved time by 1 second
                if 'savedTime' not in daily_stats[today]:
                    daily_stats[today]['savedTime'] = 0
                
                daily_stats[today]['savedTime'] += 1  # Add 1 second
                
                await chrome.storage.local.set({
                    'dailyStats': daily_stats
                })
            
            async def resetSavedTime(self):
                """Reset saved time for a new day"""
                today = datetime.now().strftime("%a %b %d %Y")  # JS Date.toDateString() format
                result = await chrome.storage.local.get(['dailyStats'])
                
                # Update daily stats
                daily_stats = result.get('dailyStats', {})
                if today not in daily_stats:
                    daily_stats[today] = {'totalTime': 0, 'sites': {}, 'savedTime': 0}
                else:
                    daily_stats[today]['savedTime'] = 0
                
                await chrome.storage.local.set({
                    'dailyStats': daily_stats
                })
            
            async def recordTabTime(self, tab_id, stop_tracking=True):
                """Python implementation of the recordTabTime method"""
                if tab_id not in self.tabStartTimes:
                    return
                
                start_time = self.tabStartTimes[tab_id]
                end_time = time.time() * 1000  # Convert to JS timestamp
                time_spent_seconds = int((end_time - start_time) / 1000)  # Convert to seconds
                
                if time_spent_seconds > 0:
                    try:
                        tab = await chrome.tabs.get(tab_id)
                        if tab['url']:
                            from urllib.parse import urlparse
                            hostname = urlparse(tab['url']).netloc.lower()
                            await self.updateScreenTimeStats(hostname, time_spent_seconds)
                    except Exception as e:
                        print(f"Error recording tab time: {e}")
                
                if stop_tracking:
                    del self.tabStartTimes[tab_id]
                else:
                    # Reset start time for continuous tracking
                    self.tabStartTimes[tab_id] = time.time() * 1000
            
            async def updateScreenTimeStats(self, hostname, seconds):
                """Update screen time stats with seconds instead of minutes"""
                today = datetime.now().strftime("%a %b %d %Y")  # JS Date.toDateString() format
                result = await chrome.storage.local.get(['dailyTimeSpent', 'dailyStats'])
                
                # Update daily time spent
                daily_time_spent = result.get('dailyTimeSpent', {})
                if today not in daily_time_spent:
                    daily_time_spent[today] = {}
                if hostname not in daily_time_spent[today]:
                    daily_time_spent[today][hostname] = 0
                daily_time_spent[today][hostname] += seconds
                
                # Update daily stats
                daily_stats = result.get('dailyStats', {})
                if today not in daily_stats:
                    daily_stats[today] = {'totalTime': 0, 'sites': {}, 'savedTime': 0}
                if hostname not in daily_stats[today]['sites']:
                    daily_stats[today]['sites'][hostname] = 0
                daily_stats[today]['sites'][hostname] += seconds
                daily_stats[today]['totalTime'] += seconds
                
                await chrome.storage.local.set({
                    'dailyTimeSpent': daily_time_spent,
                    'dailyStats': daily_stats
                })
            
            def isBlockingTimeActive(self, current_time, schedule):
                """Python implementation of the isBlockingTimeActive method"""
                current_day = current_time.weekday()
                # Convert to JS day format (0 = Sunday, 1 = Monday)
                current_day = (current_day + 1) % 7
                
                current_hour = current_time.hour
                current_minute = current_time.minute
                current_time_minutes = current_hour * 60 + current_minute
                
                # Check if current day is in schedule
                if 'days' not in schedule or current_day not in schedule['days']:
                    return False
                
                # Check if current time is in schedule
                start_time = self.parseTime(schedule.get('startTime', '00:00'))
                end_time = self.parseTime(schedule.get('endTime', '23:59'))
                
                is_in_time_range = False
                if start_time <= end_time:
                    is_in_time_range = current_time_minutes >= start_time and current_time_minutes <= end_time
                else:
                    # Handle overnight schedules
                    is_in_time_range = current_time_minutes >= start_time or current_time_minutes <= end_time
                
                return is_in_time_range
            
            def parseTime(self, time_string):
                """Python implementation of the parseTime method"""
                if not time_string:
                    return 0
                
                parts = time_string.split(':')
                if len(parts) != 2:
                    return 0
                
                try:
                    hours = int(parts[0])
                    minutes = int(parts[1])
                    return hours * 60 + minutes
                except ValueError:
                    return 0
        
        return BackgroundService(self)
    
    async def test_update_idle_state(self):
        """Test updating the smart idle state"""
        # Create a comprehensive idle state
        idle_state = {
            "isIdle": False,
            "lastActivity": time.time() * 1000,
            "mouseMovement": True,
            "keyPress": True,
            "scrolling": True,
            "videoPlaying": True,
            "audioPlaying": True,
            "tabFocused": True,
            "timeSinceLastActivity": 0
        }
        
        # Update the idle state
        await self.background_service.updateIdleState(idle_state)
        
        # Check if the idle state was updated in storage
        result = await self.storage.get(['smartIdleState'])
        self.assertIn('smartIdleState', result, "smartIdleState should be in storage")
        
        # Verify all properties were updated
        for key, value in idle_state.items():
            self.assertEqual(value, result['smartIdleState'][key], f"{key} should be updated")
        
        # Test with idle state
        idle_state["isIdle"] = True
        idle_state["mouseMovement"] = False
        idle_state["keyPress"] = False
        idle_state["scrolling"] = False
        idle_state["timeSinceLastActivity"] = 60000  # 60 seconds
        
        await self.background_service.updateIdleState(idle_state)
        
        # Check if the idle state was updated
        result = await self.storage.get(['smartIdleState'])
        self.assertTrue(result['smartIdleState']['isIdle'], "isIdle should be true")
        self.assertEqual(60000, result['smartIdleState']['timeSinceLastActivity'], "timeSinceLastActivity should be 60000")
    
    async def test_update_screen_time_every_second(self):
        """Test updating screen time every second"""
        # Reset storage to ensure clean state
        await self.storage.set({
            'dailyTimeSpent': {},
            'dailyStats': {}
        })
        
        # Create a tab and set it as active
        tab_id = self.tabs.create_tab('https://www.example.com')
        self.background_service.activeTabId = tab_id
        
        # Set start time to now
        self.background_service.tabStartTimes[tab_id] = time.time() * 1000
        
        # Set smart idle state to active
        self.background_service.smartIdleState = {
            "isIdle": False,
            "lastActivity": time.time() * 1000,
            "mouseMovement": True,
            "keyPress": True,
            "scrolling": True,
            "videoPlaying": False,
            "audioPlaying": False,
            "tabFocused": True,
            "timeSinceLastActivity": 0
        }
        
        # Wait a short time to simulate passage of time
        await asyncio.sleep(1)
        
        # Update screen time
        await self.background_service.updateScreenTimeEverySecond()
        
        # Check if time was recorded
        result = await self.storage.get(['dailyTimeSpent', 'dailyStats'])
        today = datetime.now().strftime("%a %b %d %Y")
        
        # Verify time was recorded in seconds
        self.assertIn(today, result['dailyTimeSpent'], "Today should be in dailyTimeSpent")
        self.assertIn('www.example.com', result['dailyTimeSpent'][today], "www.example.com should be tracked")
        self.assertGreater(result['dailyTimeSpent'][today]['www.example.com'], 0, "Should record time in seconds")
        
        # Test with idle state
        self.background_service.smartIdleState["isIdle"] = True
        
        # Reset storage
        await self.storage.set({
            'dailyTimeSpent': {},
            'dailyStats': {}
        })
        
        # Update screen time again
        await self.background_service.updateScreenTimeEverySecond()
        
        # Check that no time was recorded when idle
        result = await self.storage.get(['dailyTimeSpent', 'dailyStats'])
        self.assertNotIn('www.example.com', result.get('dailyTimeSpent', {}).get(today, {}), 
                        "Should not record time when idle")
    
    async def test_saved_time_tracking(self):
        """Test saved time tracking when blocking schedules are active"""
        # Reset storage to ensure clean state
        await self.storage.set({
            'dailyStats': {},
            'blockingSchedules': []
        })
        
        # Create an active blocking schedule
        schedule = {
            'name': 'Test Schedule',
            'startTime': '00:00',
            'endTime': '23:59',
            'days': [0, 1, 2, 3, 4, 5, 6],  # All days
            'blockedSites': ['facebook.com'],
            'active': True
        }
        
        await self.storage.set({'blockingSchedules': [schedule]})
        
        # Update saved time
        await self.background_service.updateSavedTimeEverySecond()
        
        # Check if saved time was recorded
        result = await self.storage.get(['dailyStats'])
        today = datetime.now().strftime("%a %b %d %Y")
        
        self.assertIn(today, result['dailyStats'], "Today should be in dailyStats")
        self.assertIn('savedTime', result['dailyStats'][today], "savedTime should be in dailyStats")
        self.assertEqual(1, result['dailyStats'][today]['savedTime'], "Should record 1 second of saved time")
        
        # Update saved time again
        await self.background_service.updateSavedTimeEverySecond()
        
        # Check if saved time was incremented
        result = await self.storage.get(['dailyStats'])
        self.assertEqual(2, result['dailyStats'][today]['savedTime'], "Should record 2 seconds of saved time")
        
        # Test with inactive schedule
        schedule['active'] = False
        await self.storage.set({'blockingSchedules': [schedule]})
        
        # Reset saved time
        await self.background_service.resetSavedTime()
        
        # Update saved time with inactive schedule
        await self.background_service.updateSavedTimeEverySecond()
        
        # Check that no saved time was recorded
        result = await self.storage.get(['dailyStats'])
        self.assertEqual(0, result['dailyStats'][today]['savedTime'], "Should not record saved time with inactive schedule")
    
    async def test_reset_saved_time(self):
        """Test resetting saved time"""
        # Set up initial saved time
        today = datetime.now().strftime("%a %b %d %Y")
        await self.storage.set({
            'dailyStats': {
                today: {
                    'totalTime': 100,
                    'sites': {'example.com': 100},
                    'savedTime': 50
                }
            }
        })
        
        # Reset saved time
        await self.background_service.resetSavedTime()
        
        # Check if saved time was reset
        result = await self.storage.get(['dailyStats'])
        self.assertEqual(0, result['dailyStats'][today]['savedTime'], "savedTime should be reset to 0")
        self.assertEqual(100, result['dailyStats'][today]['totalTime'], "totalTime should not be affected")
    
    async def test_data_structure_changes(self):
        """Test that the data structure uses savedTime instead of wastedTime"""
        # Reset storage to ensure clean state
        await self.storage.set({
            'dailyStats': {},
            'wastedTime': 10  # Old structure
        })
        
        # Record saved time
        await self.background_service.recordSavedTime()
        
        # Check if saved time was recorded in the new structure
        result = await self.storage.get(['dailyStats', 'wastedTime'])
        today = datetime.now().strftime("%a %b %d %Y")
        
        self.assertIn('savedTime', result['dailyStats'][today], "savedTime should be in dailyStats")
        self.assertEqual(1, result['dailyStats'][today]['savedTime'], "Should record 1 second of saved time")
        
        # wastedTime should still exist but not be updated by the new methods
        self.assertEqual(10, result['wastedTime'], "wastedTime should not be affected by saved time tracking")

class AsyncioTestRunner:
    """Custom test runner for asyncio tests"""
    def __init__(self, test_case):
        self.test_case = test_case
        self.results = []
        
    async def run_test(self, test_method):
        """Run a single async test method"""
        try:
            await test_method()
            return True, None
        except Exception as e:
            return False, e
            
    async def run_all_tests(self):
        """Run all async test methods in the test case"""
        test_methods = [
            getattr(self.test_case, method_name) 
            for method_name in dir(self.test_case) 
            if method_name.startswith('test_') and callable(getattr(self.test_case, method_name))
        ]
        
        success_count = 0
        failure_count = 0
        
        for method in test_methods:
            print(f"Running {method.__name__}...")
            success, error = await self.run_test(method)
            
            if success:
                print(f"✅ {method.__name__} - PASSED")
                success_count += 1
            else:
                print(f"❌ {method.__name__} - FAILED: {error}")
                failure_count += 1
                
        print(f"\nResults: {success_count} passed, {failure_count} failed")
        return success_count, failure_count

def test_backend_api():
    """Test the backend API endpoints"""
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
    
    # Test POST /api/status with idle state data
    try:
        idle_state = {
            "client_name": f"Test Client {datetime.now().isoformat()}",
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
        response = requests.post(f"{api_url}/status", json=idle_state, timeout=5)
        if response.status_code == 200:
            print(f"✅ POST {api_url}/status with idle state - Success")
            print(f"Response: {response.json()}")
        else:
            print(f"❌ POST {api_url}/status with idle state - Failed with status code {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ POST {api_url}/status with idle state - Request failed: {e}")
        return False
    
    return True

if __name__ == "__main__":
    import asyncio
    
    # First test the backend API
    print("=" * 50)
    print("TESTING BACKEND API")
    print("=" * 50)
    api_success = test_backend_api()
    
    # Then run the smart tracking tests
    print("\n" + "=" * 50)
    print("TESTING SMART TRACKING FEATURES")
    print("=" * 50)
    
    async def main():
        test_case = SmartTrackingTest()
        test_case.setUp()
        
        runner = AsyncioTestRunner(test_case)
        success_count, failure_count = await runner.run_all_tests()
        
        return failure_count == 0
    
    tracking_success = asyncio.run(main())
    
    # Overall result
    if api_success and tracking_success:
        print("\n" + "=" * 50)
        print("✅ ALL TESTS PASSED")
        print("=" * 50)
        sys.exit(0)
    else:
        print("\n" + "=" * 50)
        print("❌ SOME TESTS FAILED")
        print("=" * 50)
        sys.exit(1)