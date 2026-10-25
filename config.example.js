/**
 * MEEG Task Tracker & Analytics — Runtime Configuration Template
 * 
 * Instructions:
 * 1. Copy this file to `config.js`:
 *    cp config.example.js config.js
 * 2. Set your production Cloudflare Worker API URL, Apps Script URLs, and Google Sheet IDs.
 * 3. `config.js` is untracked by git to ensure secrets and deployment endpoints remain private.
 */
window.APP_CONFIG = {
  // Cloudflare Worker API Base URL
  API_BASE: "https://meti-task-tracker-api.eslam-mohamed2002324.workers.dev",

  // Google Apps Script Web App for Roster & Live Submission Sync
  GAS_WEBAPP_URL: "https://script.google.com/macros/s/AKfycbxa-Id35-ob1ZCgajX-NLKtz6xPLJVqBd20v7rXdlsoTmeP6nhfvl0of2U2j1RKo3A/exec",

  // Google Apps Script Web App for Archive Sheet Metadata Lookup & Service Account proxy
  ARCHIVE_TABS_URL: "https://script.google.com/macros/s/AKfycbxIqJnT2eX1Ll1S9MY1iSQmS4FLW1p4N_kLNZcdL0xZOCD2OjxOf2ZdkTx-PDjj_dhj/exec",

  // Legacy Archive Spreadsheet ID (used as last-resort fallback)
  ARCHIVE_SHEET_ID: "1BSeiRLiRTSmH_Et0B8TQAPKsuY98CVSB-gcg6ai51YQ"
};
