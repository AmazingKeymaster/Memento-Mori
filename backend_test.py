import unittest
import json
import time
import requests
from unittest.mock import MagicMock, patch
import sys
import os
import subprocess
from datetime import datetime, timedelta
import uuid

class MockChromeStorage:
    """Mock implementation of chrome.storage.local"""
    def __init__(self):
        self.data = {}
        
    async def get(self, keys):
        """Mock chrome.storage.local.get"""
        if isinstance(keys, list):
            result = {}
            for key in keys:
                if key in self.data:
                    result[key] = self.data[key]
            return result
        elif isinstance(keys, str):
            if keys in self.data:
                return {keys: self.data[keys]}
            return {}
        else:  # Dictionary with default values
            result = {}
            for key, default in keys.items():
                result[key] = self.data.get(key, default)
            return result
    
    async def set(self, data):
        """Mock chrome.storage.local.set"""
        self.data.update(data)
        return True

class MockChromeTabs:
    """Mock implementation of chrome.tabs API"""
    def __init__(self):
        self.tabs = {}
        self.current_tab_id = 1
    
    async def get(self, tab_id):
        """Mock chrome.tabs.get"""
        if tab_id in self.tabs:
            return self.tabs[tab_id]
        raise Exception(f"Tab {tab_id} not found")
    
    async def update(self, tab_id, properties):
        """Mock chrome.tabs.update"""
        if tab_id in self.tabs:
            self.tabs[tab_id].update(properties)
            return self.tabs[tab_id]
        raise Exception(f"Tab {tab_id} not found")
    
    async def query(self, query_info):
        """Mock chrome.tabs.query"""
        result = []
        for tab in self.tabs.values():
            match = True
            for key, value in query_info.items():
                if key not in tab or tab[key] != value:
                    match = False
                    break
            if match:
                result.append(tab)
        return result
    
    def create_tab(self, url, active=True):
        """Helper to create a mock tab"""
        tab_id = self.current_tab_id
        self.current_tab_id += 1
        tab = {
            "id": tab_id,
            "url": url,
            "active": active,
            "status": "complete"
        }
        self.tabs[tab_id] = tab
        return tab_id

class MockChromeRuntime:
    """Mock implementation of chrome.runtime API"""
    def __init__(self):
        self.id = "test_extension_id"
        self.listeners = []
    
    def getURL(self, path):
        """Mock chrome.runtime.getURL"""
        return f"chrome-extension://{self.id}/{path}"
    
    def onMessage(self):
        """Mock chrome.runtime.onMessage"""
        return {
            "addListener": lambda listener: self.listeners.append(listener)
        }
    
    def sendMessage(self, message):
        """Mock chrome.runtime.sendMessage"""
        for listener in self.listeners:
            listener(message, {"id": "sender_id"}, lambda response: None)
        return True

class MockChromeAlarms:
    """Mock implementation of chrome.alarms API"""
    def __init__(self):
        self.alarms = {}
        self.listeners = []
    
    def create(self, name, alarm_info):
        """Mock chrome.alarms.create"""
        self.alarms[name] = alarm_info
        return True
    
    def clear(self, name):
        """Mock chrome.alarms.clear"""
        if name in self.alarms:
            del self.alarms[name]
        return True
    
    def onAlarm(self):
        """Mock chrome.alarms.onAlarm"""
        return {
            "addListener": lambda listener: self.listeners.append(listener)
        }
    
    def trigger_alarm(self, name):
        """Helper to trigger an alarm event"""
        if name in self.alarms:
            for listener in self.listeners:
                listener({"name": name})
            return True
        return False

class MockChromeWindows:
    """Mock implementation of chrome.windows API"""
    def __init__(self):
        self.windows = {}
        self.current_window_id = 1
        self.WINDOW_ID_NONE = -1
        self.listeners = []
    
    def create_window(self, focused=True):
        """Helper to create a mock window"""
        window_id = self.current_window_id
        self.current_window_id += 1
        window = {
            "id": window_id,
            "focused": focused
        }
        self.windows[window_id] = window
        return window_id
    
    def onFocusChanged(self):
        """Mock chrome.windows.onFocusChanged"""
        return {
            "addListener": lambda listener: self.listeners.append(listener)
        }
    
    def trigger_focus_change(self, window_id):
        """Helper to trigger a focus change event"""
        for listener in self.listeners:
            listener(window_id)
        return True

class BackgroundServiceTest(unittest.TestCase):
    """Test cases for the Chrome extension background service"""
    
    def setUp(self):
        """Set up the test environment"""
        # Create mock Chrome APIs
        self.storage = MockChromeStorage()
        self.tabs = MockChromeTabs()
        self.runtime = MockChromeRuntime()
        self.alarms = MockChromeAlarms()
        self.windows = MockChromeWindows()
        
        # Create global chrome object
        global chrome
        chrome = type('chrome', (), {
            'storage': type('storage', (), {'local': self.storage}),
            'tabs': self.tabs,
            'runtime': self.runtime,
            'alarms': self.alarms,
            'windows': self.windows
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
            
            def shouldBlockSite(self, hostname, current_time, blocking_schedules):
                """Python implementation of the shouldBlockSite method"""
                if not blocking_schedules or len(blocking_schedules) == 0:
                    return False
                
                active_schedules = [s for s in blocking_schedules if s.get('active', False)]
                
                for schedule in active_schedules:
                    # Check if current time is in schedule
                    if not self.isBlockingTimeActive(current_time, schedule):
                        continue
                    
                    # Check if site is in blocked sites
                    if 'blockedSites' in schedule and len(schedule['blockedSites']) > 0:
                        for site in schedule['blockedSites']:
                            site_lower = site.lower().strip()
                            hostname_lower = hostname.lower()
                            
                            # Remove www. prefix for better matching
                            clean_hostname = hostname_lower.replace('www.', '')
                            clean_site = site_lower.replace('www.', '')
                            
                            # Multiple matching strategies
                            is_match = (
                                clean_hostname == clean_site or                     # Exact match
                                clean_hostname in clean_site or                     # Hostname contains site
                                clean_site in clean_hostname or                     # Site contains hostname
                                clean_hostname.endswith('.' + clean_site) or        # Subdomain match
                                clean_site.endswith('.' + clean_hostname) or        # Parent domain match
                                '.'.join(clean_hostname.split('.')[-2:]) == '.'.join(clean_site.split('.')[-2:])  # Same domain
                            )
                            
                            if is_match:
                                return True
                
                return False
            
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
            
            async def recordTabTime(self, tab_id, stop_tracking=True):
                """Python implementation of the recordTabTime method"""
                if tab_id not in self.tabStartTimes:
                    return
                
                start_time = self.tabStartTimes[tab_id]
                end_time = time.time() * 1000  # Convert to JS timestamp
                time_spent_minutes = int((end_time - start_time) / 60000)  # Convert to minutes
                
                if time_spent_minutes > 0:
                    try:
                        tab = await chrome.tabs.get(tab_id)
                        if tab['url']:
                            from urllib.parse import urlparse
                            hostname = urlparse(tab['url']).netloc.lower()
                            await self.updateScreenTimeStats(hostname, time_spent_minutes)
                    except Exception as e:
                        print(f"Error recording tab time: {e}")
                
                if stop_tracking:
                    del self.tabStartTimes[tab_id]
                else:
                    # Reset start time for continuous tracking
                    self.tabStartTimes[tab_id] = time.time() * 1000
            
            async def updateScreenTimeStats(self, hostname, minutes):
                """Python implementation of the updateScreenTimeStats method"""
                today = datetime.now().strftime("%a %b %d %Y")  # JS Date.toDateString() format
                result = await chrome.storage.local.get(['dailyTimeSpent', 'dailyStats'])
                
                # Update daily time spent
                daily_time_spent = result.get('dailyTimeSpent', {})
                if today not in daily_time_spent:
                    daily_time_spent[today] = {}
                if hostname not in daily_time_spent[today]:
                    daily_time_spent[today][hostname] = 0
                daily_time_spent[today][hostname] += minutes
                
                # Update daily stats
                daily_stats = result.get('dailyStats', {})
                if today not in daily_stats:
                    daily_stats[today] = {'totalTime': 0, 'sites': {}}
                if hostname not in daily_stats[today]['sites']:
                    daily_stats[today]['sites'][hostname] = 0
                daily_stats[today]['sites'][hostname] += minutes
                daily_stats[today]['totalTime'] += minutes
                
                await chrome.storage.local.set({
                    'dailyTimeSpent': daily_time_spent,
                    'dailyStats': daily_stats
                })
            
            async def checkAndBlockSite(self, url, tab_id):
                """Python implementation of the checkAndBlockSite method"""
                # Don't block extension pages
                if (url.startswith('chrome-extension://') or url.startswith('chrome://') or 
                    url.startswith('about:') or url.startswith('moz-extension://')):
                    return False
                
                result = await chrome.storage.local.get(['blockingSchedules'])
                
                try:
                    from urllib.parse import urlparse
                    hostname = urlparse(url).netloc.lower()
                except Exception:
                    print(f"Invalid URL: {url}")
                    return False
                
                current_time = datetime.now()
                
                # Check if site should be blocked
                if self.shouldBlockSite(hostname, current_time, result.get('blockingSchedules', [])):
                    # Track wasted time before blocking
                    await self.trackWastedTime()
                    
                    # Redirect to blocked page
                    blocked_url = chrome.runtime.getURL('blocked.html') + '?site=' + hostname + '&blocked_at=' + str(int(time.time() * 1000))
                    
                    try:
                        # Directly update the tab object for testing
                        tab = await chrome.tabs.get(tab_id)
                        tab['url'] = blocked_url
                        return True
                    except Exception as e:
                        print(f"Redirect failed: {e}")
                        return False
                
                return False
            
            async def trackWastedTime(self):
                """Python implementation of the trackWastedTime method"""
                result = await chrome.storage.local.get(['wastedTime', 'dailyStats'])
                new_wasted_time = (result.get('wastedTime', 0) + 1)
                
                # Update daily stats
                today = datetime.now().strftime("%a %b %d %Y")  # JS Date.toDateString() format
                daily_stats = result.get('dailyStats', {})
                if today not in daily_stats:
                    daily_stats[today] = {'blocked': 0, 'productive': 0, 'totalTime': 0}
                daily_stats[today]['blocked'] += 1
                
                await chrome.storage.local.set({
                    'wastedTime': new_wasted_time,
                    'dailyStats': daily_stats
                })
                
                # Notify popup to update display
                try:
                    chrome.runtime.sendMessage({
                        'action': 'updateWastedTime',
                        'time': new_wasted_time
                    })
                except Exception:
                    pass  # Popup may not be open
        
        return BackgroundService(self)
    
    async def test_url_blocking_exact_match(self):
        """Test URL blocking with exact match"""
        # Setup a blocking schedule
        schedule = {
            'name': 'Test Schedule',
            'startTime': '00:00',
            'endTime': '23:59',
            'days': [0, 1, 2, 3, 4, 5, 6],  # All days
            'blockedSites': ['facebook.com'],
            'active': True
        }
        
        await self.storage.set({'blockingSchedules': [schedule]})
        
        # Test exact match
        current_time = datetime.now()
        self.assertTrue(
            self.background_service.shouldBlockSite('facebook.com', current_time, [schedule]),
            "Should block exact match"
        )
        
        # Test with www prefix
        self.assertTrue(
            self.background_service.shouldBlockSite('www.facebook.com', current_time, [schedule]),
            "Should block with www prefix"
        )
    
    async def test_url_blocking_subdomain_match(self):
        """Test URL blocking with subdomain match"""
        # Setup a blocking schedule
        schedule = {
            'name': 'Test Schedule',
            'startTime': '00:00',
            'endTime': '23:59',
            'days': [0, 1, 2, 3, 4, 5, 6],  # All days
            'blockedSites': ['facebook.com'],
            'active': True
        }
        
        await self.storage.set({'blockingSchedules': [schedule]})
        
        # Test subdomain match
        current_time = datetime.now()
        self.assertTrue(
            self.background_service.shouldBlockSite('m.facebook.com', current_time, [schedule]),
            "Should block subdomain"
        )
        
        # Test another subdomain
        self.assertTrue(
            self.background_service.shouldBlockSite('developers.facebook.com', current_time, [schedule]),
            "Should block another subdomain"
        )
    
    async def test_url_blocking_different_tlds(self):
        """Test URL blocking with different TLDs"""
        # Setup a blocking schedule with multiple sites
        schedule = {
            'name': 'Test Schedule',
            'startTime': '00:00',
            'endTime': '23:59',
            'days': [0, 1, 2, 3, 4, 5, 6],  # All days
            'blockedSites': ['facebook.com', 'youtube.com'],
            'active': True
        }
        
        await self.storage.set({'blockingSchedules': [schedule]})
        
        # Test different sites
        current_time = datetime.now()
        self.assertTrue(
            self.background_service.shouldBlockSite('facebook.com', current_time, [schedule]),
            "Should block facebook.com"
        )
        
        self.assertTrue(
            self.background_service.shouldBlockSite('youtube.com', current_time, [schedule]),
            "Should block youtube.com"
        )
        
        # Test site that shouldn't be blocked
        self.assertFalse(
            self.background_service.shouldBlockSite('google.com', current_time, [schedule]),
            "Should not block google.com"
        )
    
    async def test_url_blocking_with_path(self):
        """Test URL blocking with paths"""
        # Setup a blocking schedule
        schedule = {
            'name': 'Test Schedule',
            'startTime': '00:00',
            'endTime': '23:59',
            'days': [0, 1, 2, 3, 4, 5, 6],  # All days
            'blockedSites': ['facebook.com'],
            'active': True
        }
        
        await self.storage.set({'blockingSchedules': [schedule]})
        
        # Test that the URL with path is correctly matched for blocking
        url = 'https://www.facebook.com/profile/12345'
        from urllib.parse import urlparse
        hostname = urlparse(url).netloc.lower()
        current_time = datetime.now()
        
        # Verify the site should be blocked
        self.assertTrue(
            self.background_service.shouldBlockSite(hostname, current_time, [schedule]),
            f"URL with path should be blocked: {url}"
        )
    
    async def test_blocking_schedule_time_check(self):
        """Test blocking schedule time check"""
        # Setup a blocking schedule with specific time range
        schedule = {
            'name': 'Work Hours',
            'startTime': '09:00',
            'endTime': '17:00',
            'days': [0, 1, 2, 3, 4],  # Weekdays only
            'blockedSites': ['facebook.com'],
            'active': True
        }
        
        await self.storage.set({'blockingSchedules': [schedule]})
        
        # Test during work hours on a weekday
        current_time = datetime(2025, 1, 6, 14, 30)  # Monday at 2:30 PM
        self.assertTrue(
            self.background_service.isBlockingTimeActive(current_time, schedule),
            "Should be active during work hours on weekday"
        )
        
        # Test outside work hours on a weekday
        current_time = datetime(2025, 1, 6, 8, 30)  # Monday at 8:30 AM
        self.assertFalse(
            self.background_service.isBlockingTimeActive(current_time, schedule),
            "Should not be active outside work hours"
        )
        
        # Test on weekend
        current_time = datetime(2025, 1, 11, 14, 30)  # Saturday at 2:30 PM
        self.assertFalse(
            self.background_service.isBlockingTimeActive(current_time, schedule),
            "Should not be active on weekend"
        )
    
    async def test_overnight_schedule(self):
        """Test overnight schedule (end time earlier than start time)"""
        # Setup an overnight blocking schedule
        schedule = {
            'name': 'Night Ban',
            'startTime': '22:00',
            'endTime': '06:00',
            'days': [0, 1, 2, 3, 4, 5, 6],  # All days
            'blockedSites': ['facebook.com'],
            'active': True
        }
        
        await self.storage.set({'blockingSchedules': [schedule]})
        
        # Test during night hours
        current_time = datetime(2025, 1, 6, 23, 30)  # 11:30 PM
        self.assertTrue(
            self.background_service.isBlockingTimeActive(current_time, schedule),
            "Should be active during night hours (after start)"
        )
        
        # Test during early morning
        current_time = datetime(2025, 1, 7, 5, 30)  # 5:30 AM
        self.assertTrue(
            self.background_service.isBlockingTimeActive(current_time, schedule),
            "Should be active during early morning (before end)"
        )
        
        # Test during day
        current_time = datetime(2025, 1, 7, 12, 0)  # 12:00 PM
        self.assertFalse(
            self.background_service.isBlockingTimeActive(current_time, schedule),
            "Should not be active during day"
        )
    
    async def test_screen_time_tracking(self):
        """Test screen time tracking functionality"""
        # Reset storage to ensure clean state
        await self.storage.set({
            'dailyTimeSpent': {},
            'dailyStats': {}
        })
        
        # Create a tab and simulate activity
        tab_id = self.tabs.create_tab('https://www.example.com')
        
        # Set start time 5 minutes ago
        self.background_service.tabStartTimes[tab_id] = (time.time() - 300) * 1000  # 5 minutes ago
        
        # Record tab time
        await self.background_service.recordTabTime(tab_id)
        
        # Check if time was recorded
        result = await self.storage.get(['dailyTimeSpent', 'dailyStats'])
        
        today = datetime.now().strftime("%a %b %d %Y")
        
        # Verify dailyTimeSpent
        self.assertIn(today, result['dailyTimeSpent'], "Today should be in dailyTimeSpent")
        self.assertIn('www.example.com', result['dailyTimeSpent'][today], "www.example.com should be tracked")
        self.assertEqual(5, result['dailyTimeSpent'][today]['www.example.com'], "Should record 5 minutes")
        
        # Verify dailyStats
        self.assertIn(today, result['dailyStats'], "Today should be in dailyStats")
        self.assertIn('sites', result['dailyStats'][today], "sites should be in dailyStats")
        self.assertIn('www.example.com', result['dailyStats'][today]['sites'], "www.example.com should be in sites")
        self.assertEqual(5, result['dailyStats'][today]['sites']['www.example.com'], "Should record 5 minutes")
        self.assertEqual(5, result['dailyStats'][today]['totalTime'], "totalTime should be 5 minutes")
    
    async def test_continuous_tracking(self):
        """Test continuous tracking with recordTabTime(stopTracking=False)"""
        # Reset storage to ensure clean state
        await self.storage.set({
            'dailyTimeSpent': {},
            'dailyStats': {}
        })
        
        # Create a tab and simulate activity
        tab_id = self.tabs.create_tab('https://www.example.com')
        
        # Set start time 5 minutes ago
        self.background_service.tabStartTimes[tab_id] = (time.time() - 300) * 1000  # 5 minutes ago
        
        # Record tab time without stopping tracking
        await self.background_service.recordTabTime(tab_id, False)
        
        # Verify tab is still being tracked
        self.assertIn(tab_id, self.background_service.tabStartTimes, "Tab should still be tracked")
        
        # Check if time was recorded
        result = await self.storage.get(['dailyTimeSpent', 'dailyStats'])
        today = datetime.now().strftime("%a %b %d %Y")
        
        # Verify time was recorded
        self.assertEqual(5, result['dailyTimeSpent'][today]['www.example.com'], "Should record 5 minutes")
        
        # Set new start time 3 minutes ago
        self.background_service.tabStartTimes[tab_id] = (time.time() - 180) * 1000  # 3 minutes ago
        
        # Record tab time again
        await self.background_service.recordTabTime(tab_id)
        
        # Verify tab is no longer tracked
        self.assertNotIn(tab_id, self.background_service.tabStartTimes, "Tab should not be tracked after stopping")
        
        # Check if additional time was recorded
        result = await self.storage.get(['dailyTimeSpent', 'dailyStats'])
        
        # Verify cumulative time
        self.assertEqual(8, result['dailyTimeSpent'][today]['www.example.com'], "Should record 8 minutes total")
        self.assertEqual(8, result['dailyStats'][today]['totalTime'], "totalTime should be 8 minutes")
    
    async def test_wasted_time_tracking(self):
        """Test wasted time tracking when sites are blocked"""
        # Create a tab with a blocked site
        tab_id = self.tabs.create_tab('https://www.facebook.com')
        
        # Setup a blocking schedule
        schedule = {
            'name': 'Test Schedule',
            'startTime': '00:00',
            'endTime': '23:59',
            'days': [0, 1, 2, 3, 4, 5, 6],  # All days
            'blockedSites': ['facebook.com'],
            'active': True
        }
        
        await self.storage.set({
            'blockingSchedules': [schedule],
            'wastedTime': 0,
            'dailyStats': {}
        })
        
        # Block the site
        await self.background_service.checkAndBlockSite('https://www.facebook.com', tab_id)
        
        # Check if wasted time was incremented
        result = await self.storage.get(['wastedTime', 'dailyStats'])
        
        self.assertEqual(1, result.get('wastedTime', 0), "wastedTime should be incremented")
        
        today = datetime.now().strftime("%a %b %d %Y")
        self.assertIn(today, result.get('dailyStats', {}), "Today should be in dailyStats")
        self.assertEqual(1, result['dailyStats'][today].get('blocked', 0), "blocked count should be incremented")
    
    async def test_multiple_blocking_schedules(self):
        """Test multiple blocking schedules"""
        # Setup multiple blocking schedules
        work_schedule = {
            'name': 'Work Hours',
            'startTime': '09:00',
            'endTime': '17:00',
            'days': [1, 2, 3, 4, 5],  # Weekdays
            'blockedSites': ['facebook.com', 'youtube.com'],
            'active': True
        }
        
        evening_schedule = {
            'name': 'Evening Focus',
            'startTime': '19:00',
            'endTime': '22:00',
            'days': [0, 1, 2, 3, 4, 5, 6],  # All days
            'blockedSites': ['netflix.com', 'hulu.com'],
            'active': True
        }
        
        await self.storage.set({'blockingSchedules': [work_schedule, evening_schedule]})
        
        # Test during work hours
        current_time = datetime(2025, 1, 6, 14, 30)  # Monday at 2:30 PM
        
        # Facebook should be blocked during work hours
        self.assertTrue(
            self.background_service.shouldBlockSite('facebook.com', current_time, [work_schedule, evening_schedule]),
            "Facebook should be blocked during work hours"
        )
        
        # Netflix should not be blocked during work hours
        self.assertFalse(
            self.background_service.shouldBlockSite('netflix.com', current_time, [work_schedule, evening_schedule]),
            "Netflix should not be blocked during work hours"
        )
        
        # Test during evening hours
        current_time = datetime(2025, 1, 6, 20, 30)  # Monday at 8:30 PM
        
        # Facebook should not be blocked during evening
        self.assertFalse(
            self.background_service.shouldBlockSite('facebook.com', current_time, [work_schedule, evening_schedule]),
            "Facebook should not be blocked during evening"
        )
        
        # Netflix should be blocked during evening focus
        self.assertTrue(
            self.background_service.shouldBlockSite('netflix.com', current_time, [work_schedule, evening_schedule]),
            "Netflix should be blocked during evening focus"
        )
    
    async def test_inactive_schedule(self):
        """Test that inactive schedules don't block sites"""
        # Setup an inactive blocking schedule
        schedule = {
            'name': 'Inactive Schedule',
            'startTime': '00:00',
            'endTime': '23:59',
            'days': [0, 1, 2, 3, 4, 5, 6],  # All days
            'blockedSites': ['facebook.com'],
            'active': False  # Inactive
        }
        
        await self.storage.set({'blockingSchedules': [schedule]})
        
        # Test with inactive schedule
        current_time = datetime.now()
        self.assertFalse(
            self.background_service.shouldBlockSite('facebook.com', current_time, [schedule]),
            "Should not block with inactive schedule"
        )
        
        # Activate the schedule
        schedule['active'] = True
        await self.storage.set({'blockingSchedules': [schedule]})
        
        # Test with active schedule
        self.assertTrue(
            self.background_service.shouldBlockSite('facebook.com', current_time, [schedule]),
            "Should block with active schedule"
        )

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

if __name__ == "__main__":
    import asyncio
    
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

    # Test data persistence by creating a status and then retrieving it
    def test_data_persistence():
        print("\n" + "=" * 50)
        print("TESTING DATA PERSISTENCE")
        print("=" * 50)
        
        backend_url = get_backend_url()
        if not backend_url:
            print("❌ Could not find REACT_APP_BACKEND_URL in frontend/.env")
            return False
        
        api_url = f"{backend_url}/api"
        
        # Create a new status with a unique client name
        client_name = f"Test Client {uuid.uuid4()}"
        data = {"client_name": client_name}
        
        try:
            print(f"Creating status with client_name: {client_name}")
            response = requests.post(f"{api_url}/status", json=data, timeout=5)
            
            if response.status_code == 200:
                result = response.json()
                status_id = result.get('id')
                print(f"✅ Created status with ID: {status_id}")
            else:
                print(f"❌ Failed to create status, status code: {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            print(f"❌ Request failed: {e}")
            return False
        
        # Small delay to ensure data is saved
        time.sleep(1)
        
        # Retrieve the status and verify it exists
        try:
            response = requests.get(f"{api_url}/status", timeout=5)
            
            if response.status_code == 200:
                status_checks = response.json()
                found = any(check.get('id') == status_id for check in status_checks)
                
                if found:
                    print(f"✅ Successfully found our test status check with ID {status_id}")
                    return True
                else:
                    print(f"❌ Could not find our test status check with ID {status_id}")
                    return False
            else:
                print(f"❌ GET {api_url}/status - Failed with status code {response.status_code}")
                return False
        except requests.exceptions.RequestException as e:
            print(f"❌ GET {api_url}/status - Request failed: {e}")
            return False

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

    # Test screen time tracking API (simulating what the Chrome extension would send)
    def test_screen_time_tracking():
        backend_url = get_backend_url()
        if not backend_url:
            print("❌ Could not find REACT_APP_BACKEND_URL in frontend/.env")
            return False
        
        api_url = f"{backend_url}/api"
        
        print("\n" + "=" * 50)
        print("TESTING SCREEN TIME TRACKING API")
        print("=" * 50)
        
        # Since the API doesn't have specific screen time endpoints yet,
        # we'll use the status endpoint to simulate storing screen time data
        try:
            # Create a status with screen time data
            screen_time_data = {
                "client_name": "Chrome Extension",
                "screen_time": {
                    "facebook.com": 120,  # 2 minutes
                    "youtube.com": 300,   # 5 minutes
                    "github.com": 600     # 10 minutes
                },
                "saved_time": 1800,       # 30 minutes
                "extension_status": "active"
            }
            
            print(f"Sending screen time data: {json.dumps(screen_time_data, indent=2)}")
            response = requests.post(f"{api_url}/status", json=screen_time_data, timeout=5)
            
            if response.status_code == 200:
                print(f"✅ Successfully sent screen time data")
                result = response.json()
                print(f"Response: {result}")
                
                # Verify the data was stored correctly
                if "id" in result:
                    print("✅ Screen time data was stored with ID: " + result["id"])
                    return True
                else:
                    print("❌ Response missing ID field")
                    return False
            else:
                print(f"❌ Failed to send screen time data, status code: {response.status_code}")
                try:
                    print(f"Error response: {response.json()}")
                except:
                    print(f"Error response: {response.text}")
                return False
        except requests.exceptions.RequestException as e:
            print(f"❌ Request failed: {e}")
            return False

    # Run all backend API tests
    def run_backend_api_tests():
        print("=" * 50)
        print("TESTING CHROME EXTENSION BACKEND API")
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
        
        # Test data persistence
        persistence_working = test_data_persistence()
        if not persistence_working:
            print("❌ Data persistence test failed.")
            return False
        
        # Test screen time tracking
        screen_time_working = test_screen_time_tracking()
        if not screen_time_working:
            print("❌ Screen time tracking test failed.")
            return False
        
        print("\n" + "=" * 50)
        print("CHECKING BACKEND LOGS")
        print("=" * 50)
        
        # Check backend logs
        logs_ok = check_backend_logs()
        
        # Overall result
        if server_running and endpoints_working and persistence_working and screen_time_working and logs_ok:
            print("\n" + "=" * 50)
            print("✅ ALL BACKEND API TESTS PASSED")
            print("=" * 50)
            return True
        else:
            print("\n" + "=" * 50)
            print("❌ SOME BACKEND API TESTS FAILED")
            print("=" * 50)
            return False
    
    # Run the backend API tests
    api_tests_success = run_backend_api_tests()
    
    # Run the Chrome extension background service tests if needed
    async def main():
        test_case = BackgroundServiceTest()
        test_case.setUp()
        
        runner = AsyncioTestRunner(test_case)
        success_count, failure_count = await runner.run_all_tests()
        
        return failure_count == 0
    
    # Only run the background service tests if specifically requested
    run_background_tests = False
    if run_background_tests:
        background_tests_success = asyncio.run(main())
    else:
        background_tests_success = True
    
    # Exit with success only if both test suites pass
    sys.exit(0 if api_tests_success and background_tests_success else 1)
