// ===== Configuration and Constants =====

const LocalDebugMode = false;
const MODULE_SEQUENCE = ['2-1.json','2-2.json','2-3.json'];

// Set to true to hide authentication box (for production)
const HIDE_AUTH_BOX = true;

// ===== Audio Playback Speed Configuration =====
// Set to true to enable speed-up mode for faster training playback
const AUDIO_SPEEDUP_ENABLED = false; // Set to true to enable speed-up mode
const AUDIO_SPEEDUP_RATE = 1.0; // Playback speed multiplier (1.0 = normal, 2.0 = 2x, 7.0 = 7x)

// ===== Segment Transition Configuration =====
// Time (in milliseconds) to wait after closing a segment before opening the next one
// This creates a brief pause to show the background between segments
const SEGMENT_TRANSITION_DELAY = 300; // 300ms = 0.3 seconds (fast but visible)

// ===== Server Communication Configuration =====
// Number of retry attempts when server communication fails
const SERVER_RETRY_ATTEMPTS = 3; // Try 3 times before giving up
// Delay between retries in milliseconds (uses exponential backoff)
const SERVER_RETRY_BASE_DELAY = 1000; // Start with 1 second, doubles each retry

const TRAINING_STRUCTURE = [
  {
    id: 'module-1',
    name: 'Module 1: Fire Safety',
    chapters: [
      {
        id: 'chapter-1-1',
        name: 'Chapter 1: Emergency Evacuation',
        segments: ['Intro', 'Evacuation Basics', 'Host & Guest Plan', 'Exit Signage', 'Emergency Manual', 'Hypothetical Example', 'Closing']
      },
      {
        id: 'chapter-1-2',
        name: 'Chapter 2: Emergency Egress',
        segments: ['Intro', 'Keeping Exit Paths Clear', 'Fire Ladders', 'Exit Signage', 'Flashlights', 'Lighting the Property', 'Hypothetical Example', 'Closing']
      },
      {
        id: 'chapter-1-3',
        name: 'Chapter 3: Fire Extinguishers',
        segments: ['Intro', 'Accessibility & Placement', 'Compliance, Tagging & Condition', 'Types of Extinguishers', 'Hypothetical Example', 'Closing']
      },
      {
        id: 'chapter-1-4',
        name: 'Chapter 4: Fire Alarm Systems',
        segments: ['Intro', 'What They Look Like & Where to Place Them', 'Local vs. Interconnected Systems', 'Common Brands', 'Testing & Monitoring Requirements', 'Showing Detectors to Inspectors', 'Hypothetical Example', 'Closing']
      },
      {
        id: 'chapter-1-5',
        name: 'Chapter 5: General Safety & Maintenance',
        segments: ['Intro', 'Electrical Systems & Breaker Boxes', 'Outlets', 'Heating Types in the Home', 'Standards for Open Flames', 'Certification & Training', 'Flammable Gas Storage', 'Closing']
      }
    ]
  },
  {
    id: 'module-2',
    name: 'Module 2: Facility Planning',
    chapters: [
      {
        id: 'chapter-2-1',
        name: 'Chapter 1: Utilities',
        segments: ['Intro', 'What Utilities Are & Why They Matter', 'Alternative Heating Sources', 'Air Conditioning Units', 'Water Availability', 'WiFi Access & Standards', 'Hypothetical Example', 'Closing']
      },
      {
        id: 'chapter-2-2',
        name: 'Chapter 2: Hazards',
        segments: ['Intro', 'Common Hazards in Homes', 'What Hazards Are & How to Identify Them', 'Weathertight Properties', 'Sewer Systems', 'Pests & Pest Programs', 'Odor & Smoking Policies', 'Hypothetical Example', 'Closing']
      },
      {
        id: 'chapter-2-3',
        name: 'Chapter 3: Other Considerations',
        segments: ['Intro', 'Safe Spaces in the Home', 'Noise Levels & Standards', 'Hypothetical Example', 'Closing']
      }
    ]
  },
  {
    id: 'module-3',
    name: 'Module 3: First Aid, Hazard Awareness',
    chapters: [
      {
        id: 'chapter-3-1',
        name: 'Chapter 1: First Aid Training',
        segments: ['Intro', 'First Aid Kits', 'The GuestGuard First Aid Logbook', 'Hypothetical Example', 'Closing']
      },
      {
        id: 'chapter-3-2',
        name: 'Chapter 2: General Considerations',
        segments: ['Intro', 'Understanding General Hazards', 'Walkways & Pathways', 'Landscaping & Security Risks', 'Hypothetical Example', 'Closing']
      }
    ]
  },
  {
    id: 'module-4',
    name: 'Module 4: Personal Safety',
    chapters: [
      {
        id: 'chapter-4-1',
        name: 'Chapter 1: Property Entry',
        segments: ['Intro', 'Types of Locks', 'Guest Safes', 'Exterior Considerations', 'Hypothetical Example', 'Closing']
      },
      {
        id: 'chapter-4-2',
        name: 'Chapter 2: Other Considerations',
        segments: ['Intro', 'Privacy & Facilities', 'Deeper', 'Hypothetical Example', 'Party Rules', 'Closing']
      }
    ]
  },
  {
    id: 'module-5',
    name: 'Module 5: Amenities, Pets, Cleanliness, Appliances',
    chapters: [
      {
        id: 'chapter-5-1',
        name: 'Chapter 1: Amenities',
        segments: ['Intro', 'Why Amenities Matter', 'Specific Amenities for Hosts to Consider', 'Hypothetical Example', 'Closing']
      },
      {
        id: 'chapter-5-2',
        name: 'Chapter 2: Pets',
        segments: ['Intro', 'Benefits of Allowing Pets', 'What to Communicate', 'Hypothetical Example', 'Closing']
      },
      {
        id: 'chapter-5-3',
        name: 'Chapter 3: General Appliances',
        segments: ['Intro', 'Key Appliances in a Property', 'Furnace and Boiler Systems', 'Safety & Utilities Reminder', 'Closing']
      }
    ]
  },
  {
    id: 'module-6',
    name: 'Module 6: Universal Accessibility',
    chapters: [
      {
        id: 'chapter-6-1',
        name: 'Chapter 1: Accessibility Accommodations',
        segments: ['Intro', 'Measurements', 'Accessible Bathroom', 'Accessible Bedroom', 'Accessible Common Spaces', 'Parking Considerations', 'Host Access', 'Additional Items', 'Closing']
      }
    ]
  }
];

// API Configuration
const API_BASE = 'https://guestguard-platform.vercel.app';
const SUPABASE_URL = 'https://uwbwaujbvqctmcpgqhds.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3YndhVWpiVnFjdG1jcGdxaGRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkzNjU2NDksImV4cCI6MjA2NDk0MTY0OX0.sb_publishable_4thWdEYtuLNTZ0R0F9Bw1w_tzYEyH9R';

// Debug Configuration
const CAPTION_DEBUG = true;

// Segment Timing Data (in seconds) - Total: 2883 seconds
const SEGMENT_TIMINGS = {
  '1-1': {
    segments: ['Intro', 'Evacuation Basics', 'Host & Guest Plan', 'Exit Signage', 'Emergency Manual', 'Hypothetical Example', 'Closing'],
    durations: [7, 26, 20, 14, 36, 34, 13]
  },
  '1-2': {
    segments: ['Intro', 'Keeping Exit Paths Clear', 'Fire Ladders', 'Exit Signage', 'Flashlights', 'Lighting the Property', 'Hypothetical Example', 'Closing'],
    durations: [17, 21, 16, 20, 16, 23, 31, 20]
  },
  '1-3': {
    segments: ['Intro', 'Accessibility & Placement', 'Compliance, Tagging & Condition', 'Types of Extinguishers', 'Hypothetical Example', 'Closing'],
    durations: [11, 31, 41, 27, 29, 22]
  },
  '1-4': {
    segments: ['Intro', 'What They Look Like & Where to Place Them', 'Local vs. Interconnected Systems', 'Common Brands', 'Testing & Monitoring Requirements', 'Showing Detectors to Inspectors', 'Hypothetical Example', 'Closing'],
    durations: [13, 23, 46, 16, 21, 13, 28, 22]
  },
  '1-5': {
    segments: ['Intro', 'Electrical Systems & Breaker Boxes', 'Outlets', 'Heating Types in the Home', 'Standards for Open Flames', 'Certification & Training', 'Flammable Gas Storage', 'Closing'],
    durations: [14, 30, 36, 28, 24, 27, 22, 24] 
  },
  '2-1': {
    segments: ['Intro', 'What Utilities Are & Why They Matter', 'Alternative Heating Sources', 'Air Conditioning Units', 'Water Availability', 'WiFi Access & Standards', 'Hypothetical Example', 'Closing'],
    durations: [16, 22, 25, 22, 15, 28, 31, 22]
  },
  '2-2': {
    segments: ['Intro', 'Common Hazards in Homes', 'What Hazards Are & How to Identify Them', 'Weathertight Properties', 'Sewer Systems', 'Pests & Pest Programs', 'Odor & Smoking Policies', 'Hypothetical Example', 'Closing'],
    durations: [13, 16, 39, 15, 18, 29, 20, 34, 22]
  },
  '2-3': {
    segments: ['Intro', 'Safe Spaces in the Home', 'Noise Levels & Standards', 'Hypothetical Example', 'Closing'],
    durations: [15, 28, 47, 26, 16]
  },
  '3-1': {
    segments: ['Intro', 'First Aid Kits', 'The GuestGuard First Aid Logbook', 'Hypothetical Example', 'Closing'],
    durations: [42, 46, 35, 32, 26]
  },
  '3-2': {
    segments: ['Intro', 'Understanding General Hazards', 'Walkways & Pathways', 'Landscaping & Security Risks', 'Hypothetical Example', 'Closing'],
    durations: [19, 22, 24, 21, 24, 22]
  },
  '4-1': {
    segments: ['Intro', 'Types of Locks', 'Guest Safes', 'Exterior Considerations', 'Hypothetical Example', 'Closing'],
    durations: [22, 40, 18, 23, 37, 20]
  },
  '4-2': {
    segments: ['Intro', 'Privacy & Facilities', 'Deeper', 'Hypothetical Example', 'Party Rules', 'Closing'],
    durations: [15, 14, 32, 31, 27, 21]
  },
  '5-1': {
    segments: ['Intro', 'Why Amenities Matter', 'Specific Amenities for Hosts to Consider', 'Hypothetical Example', 'Closing'],
    durations: [23, 15, 56, 40, 8]
  },
  '5-2': {
    segments: ['Intro', 'Benefits of Allowing Pets', 'What to Communicate', 'Hypothetical Example', 'Closing'],
    durations: [24, 19, 30, 24, 16]
  },
  '5-3': {
    segments: ['Intro', 'Key Appliances in a Property', 'Furnace and Boiler Systems', 'Safety & Utilities Reminder', 'Closing'],
    durations: [11, 29, 24, 35, 16]
  },
  '6-1': {
    segments: ['Intro', 'Measurements', 'Accessible Bathroom', 'Accessible Bedroom', 'Accessible Common Spaces', 'Parking Considerations', 'Host Access', 'Additional Items', 'Closing'],
    durations: [105, 27, 128, 39, 51, 18, 55, 50, 44]
  }
};

// Calculate totals for reference
const TIMING_TOTALS = {
  '1-1': 150,
  '1-2': 164,
  '1-3': 161,
  '1-4': 182,
  '1-5': 205,
  '2-1': 181,
  '2-2': 206,
  '2-3': 132,
  '3-1': 181,
  '3-2': 132,
  '4-1': 160,
  '4-2': 140,
  '5-1': 142,
  '5-2': 113,
  '5-3': 115, 
  '6-1': 517
};

// Total training time: 2883 seconds (48 minutes, 3 seconds) for completed chapters

// Make timing data globally accessible
window.SEGMENT_TIMINGS = SEGMENT_TIMINGS;
window.TIMING_TOTALS = TIMING_TOTALS;
