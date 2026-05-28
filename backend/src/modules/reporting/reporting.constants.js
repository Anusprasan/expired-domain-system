export const REPORTING_ISSUE_TYPES = [
  "cloaking",
  "brand_phishing",
  "death_phishing",
  "stray_domain",
];

export const REPORTING_STATUSES = [
  "open",
  "in_progress",
  "reported",
  "submitted",
  "resolved",
];

export const REPORTING_EVIDENCE_MIN_CLEANUP_DAYS = 5;
export const REPORTING_EVIDENCE_DELETE_CONFIRMATION_TEXT = "DELETE";

export const REPORTING_WORKFLOW_DEFAULTS = [
  {
    issueType: "cloaking",
    title: "Cloaking (Spam/Gambling)",
    guideTitle: "Cloaking workflow",
    tone: "blue",
    label: "Standard Operating Procedure",
    note: "",
    summary: "",
    badge: "",
    steps: [
      "Screenshot the site in Google Search Results.",
      "Screenshot the Google AMP Test mobile render result.",
      "Use Phish.report or WHOIS to find the host and prepare the complaint.",
      "Send the host report and upload all evidence to Google Drive.",
    ],
    links: [],
  },
  {
    issueType: "brand_phishing",
    title: "Brand Phishing",
    guideTitle: "Brand phishing workflow",
    tone: "amber",
    label: "Phishing Takedown Protocol",
    note: "Phishing sites often use cloaking. Use the full screenshot process for both desktop and mobile views.",
    summary: "",
    badge: "",
    steps: [
      "Evidence Capture: Screenshot Google Search Results and the landing page.",
      "Google Report: Submit DMCA or legal forms using the links below.",
      "Host Report: Use Phish.report or WHOIS to find the hosting service and submit the complaint with screenshots.",
    ],
    links: [
      {
        label: "Google DMCA Report",
        href: "https://reportcontent.google.com/forms/dmca_search?ai0&pli=1",
      },
      {
        label: "Legal Content Removal",
        href: "https://support.google.com/legal/contact/lr_legalother?ai0=&product=websearch",
      },
    ],
  },
  {
    issueType: "death_phishing",
    title: "Death Phishing & Tools",
    guideTitle: "Death phishing workflow",
    tone: "red",
    label: "",
    note: "",
    summary: "Use these shortcuts when a domain needs urgent visibility removal or search cleanup while formal reporting is in progress.",
    badge: "Urgent",
    steps: [
      "Confirm the abusive domain is dead or unreachable.",
      "Use SafeBrowsing and search cleanup tools to remove visibility.",
      "Document each removal request and outcome.",
      "Upload the final evidence set and mark the work for review.",
    ],
    links: [
      { label: "Google SafeBrowsing", href: "https://www.google.com/safebrowsing/report_phish/" },
      { label: "Report Search Spam", href: "https://search.google.com/search-console/report-spam" },
      {
        label: "Remove Outdated Content",
        href: "https://search.google.com/search-console/remove-outdated-content",
      },
      { label: "Ping Index Tool", href: "https://www.prepostseo.com/ping-multiple-urls-online" },
    ],
  },
  {
    issueType: "stray_domain",
    title: "Stray Domains",
    guideTitle: "Stray domain workflow",
    tone: "slate",
    label: "Reporting Steps",
    note: "",
    summary: "",
    badge: "",
    steps: [
      "Get screenshots of the pages after visiting.",
      "Use Phish.report or WHOIS to find the hosting service and submit the complaint with screenshots.",
    ],
    links: [],
  },
];
