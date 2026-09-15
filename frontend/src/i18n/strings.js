// MODULE 8 (multilingual) - UI chrome strings. Alert messages themselves are
// bilingual server-side (backend/src/i18n/*.json); this covers navigation
// and common labels. Adding a third language: drop a new key here (e.g.
// 'as' for Assamese) and add it to LANGUAGES below - no other code changes.

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' }
];

const STRINGS = {
  en: {
    nav_dashboard: 'Dashboard', nav_myJourney: 'My Journey', nav_map: 'NER Map', nav_routePlanner: 'Route Planner',
    nav_vehicles: 'Vehicle Tracking', nav_shipments: 'Shipments', nav_incidents: 'Incidents',
    nav_fieldReporting: 'Field Reporting', nav_alerts: 'Alerts', nav_emergency: 'Emergency Mode',
    nav_districtAnalytics: 'District Analytics', nav_bottlenecks: 'Bottleneck Analytics',
    nav_weather: 'Weather / Risk', nav_admin: 'Administration', nav_profile: 'Profile & Settings',
    logout: 'Log out', simulated_data: 'Simulated / demo data', platform_generated: 'Platform-generated analytical metric, not an official statistic',
    offline: 'OFFLINE', online: 'ONLINE', syncing: 'SYNCING', synced: 'SYNCED', sync_failed: 'SYNC FAILED'
  },
  hi: {
    nav_dashboard: 'डैशबोर्ड', nav_myJourney: 'मेरी यात्रा', nav_map: 'NER मानचित्र', nav_routePlanner: 'मार्ग योजनाकार',
    nav_vehicles: 'वाहन ट्रैकिंग', nav_shipments: 'शिपमेंट', nav_incidents: 'घटनाएँ',
    nav_fieldReporting: 'फील्ड रिपोर्टिंग', nav_alerts: 'अलर्ट', nav_emergency: 'आपातकालीन मोड',
    nav_districtAnalytics: 'जिला विश्लेषण', nav_bottlenecks: 'बाधा विश्लेषण',
    nav_weather: 'मौसम / जोखिम', nav_admin: 'प्रशासन', nav_profile: 'प्रोफ़ाइल और सेटिंग्स',
    logout: 'लॉग आउट', simulated_data: 'सिम्युलेटेड / डेमो डेटा', platform_generated: 'प्लेटफ़ॉर्म-जनित विश्लेषणात्मक मीट्रिक, आधिकारिक आँकड़ा नहीं',
    offline: 'ऑफ़लाइन', online: 'ऑनलाइन', syncing: 'सिंक हो रहा है', synced: 'सिंक हो गया', sync_failed: 'सिंक विफल'
  }
};

export function t(lang, key) {
  return STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
}
