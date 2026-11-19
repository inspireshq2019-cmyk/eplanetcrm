// Reference data loaded into a new Eplanet CRM database.
// Offices come from Education Planet's published global office list; Dhaka is the pilot branch.

export const COUNTRIES: [code: string, name: string, currency: string][] = [
  ["BD", "Bangladesh", "BDT"], ["NP", "Nepal", "NPR"], ["AU", "Australia", "AUD"], ["IN", "India", "INR"],
  ["PH", "Philippines", "PHP"], ["LK", "Sri Lanka", "LKR"], ["GB", "United Kingdom", "GBP"], ["CA", "Canada", "CAD"],
  ["US", "United States", "USD"], ["NZ", "New Zealand", "NZD"], ["IE", "Ireland", "EUR"], ["DE", "Germany", "EUR"],
  ["FR", "France", "EUR"], ["NL", "Netherlands", "EUR"], ["ES", "Spain", "EUR"], ["SE", "Sweden", "SEK"],
  ["IT", "Italy", "EUR"], ["CH", "Switzerland", "CHF"], ["CY", "Cyprus", "EUR"], ["MT", "Malta", "EUR"],
  ["FI", "Finland", "EUR"], ["DK", "Denmark", "DKK"], ["HU", "Hungary", "HUF"], ["PL", "Poland", "PLN"],
  ["LT", "Lithuania", "EUR"], ["LV", "Latvia", "EUR"], ["AT", "Austria", "EUR"], ["BE", "Belgium", "EUR"],
  ["CZ", "Czechia", "CZK"], ["PT", "Portugal", "EUR"],
];

export type BranchSeed = {
  code: string; name: string; country: string; city: string; address: string; phone: string; email: string;
  timezone: string; currency: string; head?: boolean;
};

export const BRANCHES: BranchSeed[] = [
  { code: "DHK", name: "Dhaka (Uttara)", country: "BD", city: "Dhaka", address: "Windflower, 5th Floor, Suite 5-C, House 30, Sonargaon Janapath Road, Uttara, Dhaka 1230", phone: "+880 1345-203093", email: "info.bd@eplanetintl.com", timezone: "Asia/Dhaka", currency: "BDT" },
  { code: "KTM", name: "Kathmandu (Bagbazar)", country: "NP", city: "Kathmandu", address: "KG Group Building, 28 Bagbazar Sadak, Kathmandu 44600", phone: "+977 01 5339656", email: "info@eplanet.edu.np", timezone: "Asia/Kathmandu", currency: "NPR", head: true },
  { code: "CHB", name: "Kathmandu (Chabahil)", country: "NP", city: "Kathmandu", address: "2nd Floor, KL Tower, Boudhanath Sadak, Kathmandu 44600", phone: "+977 01 5928292", email: "chabahil@eplanet.edu.np", timezone: "Asia/Kathmandu", currency: "NPR" },
  { code: "MCP", name: "Kathmandu (Machhapokhari)", country: "NP", city: "Kathmandu", address: "4th Floor, Nabil Bank Building, Machhapokhari Chowk, Balaju 16, Kathmandu", phone: "+977 01 5913186", email: "usha.kandel@eplanet.edu.np", timezone: "Asia/Kathmandu", currency: "NPR" },
  { code: "KMP", name: "Lalitpur (Kumaripati)", country: "NP", city: "Lalitpur", address: "2nd Floor, opposite UFO, Kumaripati, Lalitpur", phone: "+977 9700058941", email: "sangam@eplanet.edu.np", timezone: "Asia/Kathmandu", currency: "NPR" },
  { code: "PKR", name: "Pokhara", country: "NP", city: "Pokhara", address: "3rd Floor, Swornim Bhawan, Naya Bazar, Pokhara", phone: "+977 061 590724", email: "pokhara@eplanet.edu.np", timezone: "Asia/Kathmandu", currency: "NPR" },
  { code: "CTW", name: "Chitwan (Narayangadh)", country: "NP", city: "Chitwan", address: "Level 2, Krishna Plaza, Shahid Chowk, Narayangadh, Chitwan", phone: "+977 056 595013", email: "bimal.adhikari@eplanet.edu.np", timezone: "Asia/Kathmandu", currency: "NPR" },
  { code: "TND", name: "Tandi (Chitwan)", country: "NP", city: "Chitwan", address: "Ratnanagar-01, Bakulahar, Tandi, Chitwan", phone: "+977 056 494455", email: "bimal.adhikari@eplanet.edu.np", timezone: "Asia/Kathmandu", currency: "NPR" },
  { code: "BTW", name: "Butwal", country: "NP", city: "Butwal", address: "Milanchowk-08, Butwal", phone: "+977 071 534777", email: "butwal@eplanet.edu.np", timezone: "Asia/Kathmandu", currency: "NPR" },
  { code: "KWS", name: "Kawasoti", country: "NP", city: "Kawasoti", address: "Indrachowk-02, Kawasoti", phone: "+977 078 541199", email: "application.kawasoti@eplanet.edu.np", timezone: "Asia/Kathmandu", currency: "NPR" },
  { code: "HTD", name: "Hetauda", country: "NP", city: "Hetauda", address: "School Road-04, Hetauda, Makwanpur", phone: "+977 057 591222", email: "hetauda@eplanet.edu.np", timezone: "Asia/Kathmandu", currency: "NPR" },
  { code: "ITH", name: "Itahari", country: "NP", city: "Itahari", address: "A&A Complex, Paschim Line-06, opposite Magic Stand, Itahari", phone: "+977 025 590101", email: "itahari@eplanet.edu.np", timezone: "Asia/Kathmandu", currency: "NPR" },
  { code: "JNK", name: "Janakpur", country: "NP", city: "Janakpur", address: "Bhanu Chowk, Janakpurdham-02 (Rastriya Banijya Bank compound)", phone: "+977 9860920693", email: "janakpur@eplanet.edu.np", timezone: "Asia/Kathmandu", currency: "NPR" },
  { code: "SYD", name: "Sydney", country: "AU", city: "Sydney", address: "Suite 503, Level 5, 235 Clarence St, Sydney NSW 2000", phone: "0452 085 777", email: "admission.syd@eplanetintl.com", timezone: "Australia/Sydney", currency: "AUD" },
  { code: "ADL", name: "Adelaide", country: "AU", city: "Adelaide", address: "Level 12, 108 King William St, Adelaide SA 5000", phone: "+61 422 180 431", email: "nabin.sa@eplanetintl.com", timezone: "Australia/Adelaide", currency: "AUD" },
  { code: "PER", name: "Perth", country: "AU", city: "Perth", address: "The Business Building, 328 Albany Hwy, Victoria Park WA 6100", phone: "+61 405 620 280", email: "nabin.bidari@eplanetintl.com", timezone: "Australia/Perth", currency: "AUD" },
  { code: "BNE", name: "Brisbane", country: "AU", city: "Brisbane", address: "Suite 3, Level 4, 144 Adelaide St, Brisbane City QLD 4000", phone: "+61 425 326 404", email: "santosh@eplanetintl.com", timezone: "Australia/Brisbane", currency: "AUD" },
  { code: "HYS", name: "Hyderabad (Somajiguda)", country: "IN", city: "Hyderabad", address: "D.No 6-3-1093, VV Vintage Residency, Raj Bhavan Rd, Somajiguda, Hyderabad, Telangana 500082", phone: "+91 93472 43914", email: "jyothi@eplanetintl.com", timezone: "Asia/Kolkata", currency: "INR" },
  { code: "HYK", name: "Hyderabad (Kukatpally)", country: "IN", city: "Hyderabad", address: "16, Gayatri Nagar, Vivekananda Nagar, Kukatpally, Hyderabad, Telangana 500072", phone: "+91 77997 83781", email: "admin.hyd@eplanetintl.com", timezone: "Asia/Kolkata", currency: "INR" },
  { code: "KRL", name: "Kerala (Ramapuram)", country: "IN", city: "Ramapuram", address: "Ramapuram Bazar, Kerala", phone: "+61 451 582 053", email: "kerala.india@eplanetintl.com", timezone: "Asia/Kolkata", currency: "INR" },
  { code: "CEB", name: "Cebu City", country: "PH", city: "Cebu City", address: "82 Vibo Centre, N Escario Street, Cebu City", phone: "+61 451 582 053", email: "nawaraj@eplanetintl.com", timezone: "Asia/Manila", currency: "PHP" },
  { code: "CMB", name: "Colombo", country: "LK", city: "Sri Jayawardenepura Kotte", address: "Sri Jayawardenepura Kotte", phone: "+61 451 582 053", email: "nawaraj@eplanetintl.com", timezone: "Asia/Colombo", currency: "LKR" },
];

// Every permission the app checks. Roles are editable later in Settings → Roles.
export const PERMISSIONS = {
  "contacts.view": "See students and leads",
  "contacts.create": "Add students and leads",
  "contacts.edit": "Edit students and leads",
  "contacts.delete": "Delete students and leads",
  "contacts.sensitive": "See passport and ID numbers",
  "contacts.export": "Export student lists",
  "applications.edit": "Create and move applications",
  "documents.manage": "Upload and verify documents",
  "visa.view": "See visa cases",
  "visa.edit": "Create and update visa cases",
  "checkin.manage": "Run the office check-in",
  "classes.manage": "Run IELTS/PTE classes",
  "oshc.manage": "Sell and track OSHC",
  "tasks.all": "See everyone's tasks in the branch",
  "finance.view": "See invoices and payments",
  "finance.edit": "Create invoices and record payments",
  "finance.void": "Void invoices",
  "partners.edit": "Edit partners, agreements and courses",
  "reports.view": "See reports and dashboards",
  "settings.users": "Manage staff accounts",
  "settings.system": "Manage branches, roles and workflows",
  "import.run": "Import data (e.g. from Agentcis)",
  "leads.connect": "Connect the branch's Facebook pages and Google Ads lead forms",
  "forms.manage": "Create event registration forms and QR codes",
  "audit.view": "See the audit log",
} as const;
export type Permission = keyof typeof PERMISSIONS;
const ALL = Object.keys(PERMISSIONS) as Permission[];
const without = (...p: Permission[]) => ALL.filter((x) => !p.includes(x));

export const ROLES: { key: string; name: string; scope: "all" | "country" | "branch" | "own"; description: string; permissions: Permission[] }[] = [
  { key: "owner", name: "Owner / Super admin", scope: "all", description: "Everything, in every branch and country.", permissions: ALL },
  { key: "country_director", name: "Country Director", scope: "country", description: "Everything in their country's branches, including staff accounts.", permissions: without("settings.system") },
  { key: "branch_head", name: "Branch Head", scope: "branch", description: "Runs a branch: all students, applications, finance and reports for that branch.", permissions: without("settings.system", "import.run") },
  { key: "operations_manager", name: "Operations Manager", scope: "branch", description: "Day-to-day operations of the branch, without voiding invoices or managing staff.", permissions: without("settings.system", "settings.users", "finance.void", "contacts.delete", "audit.view", "import.run") },
  { key: "counsellor", name: "Counsellor", scope: "own", description: "Their own students plus unassigned leads in their branch.", permissions: ["contacts.view", "contacts.create", "contacts.edit", "applications.edit", "documents.manage", "visa.view", "checkin.manage", "oshc.manage"] },
  { key: "admissions", name: "Admissions & Compliance", scope: "branch", description: "Applications, documents and checklists for the whole branch.", permissions: ["contacts.view", "contacts.edit", "contacts.sensitive", "applications.edit", "documents.manage", "visa.view", "tasks.all", "reports.view", "partners.edit"] },
  { key: "migration_agent", name: "Registered Migration Agent (OMARA)", scope: "branch", description: "Visa cases. Add other branches to their account to work on students from those branches.", permissions: ["contacts.view", "contacts.edit", "contacts.sensitive", "documents.manage", "visa.view", "visa.edit", "applications.edit", "tasks.all"] },
  { key: "ielts_trainer", name: "IELTS / PTE Trainer", scope: "branch", description: "Classes, attendance and mock-test scores.", permissions: ["contacts.view", "classes.manage"] },
  { key: "finance", name: "Accounts & Finance", scope: "branch", description: "Invoices, payments, receipts and commissions.", permissions: ["contacts.view", "finance.view", "finance.edit", "reports.view", "oshc.manage"] },
  { key: "marketing", name: "Digital Marketing", scope: "branch", description: "Adds and views leads, connects the branch's ad lead forms and sees lead reports; no finance or documents.", permissions: ["contacts.view", "contacts.create", "reports.view", "leads.connect", "forms.manage"] },
  { key: "front_desk", name: "Front Desk", scope: "branch", description: "Welcomes visitors, runs the check-in queue and books appointments.", permissions: ["contacts.view", "contacts.create", "checkin.manage"] },
];

// Dhaka team (pilot). Real email addresses must be entered in Settings → Staff before go-live.
export const DHAKA_STAFF: { name: string; title: string; role: string }[] = [
  { name: "Shah Zaman Bhuiyan", title: "Country Director, Bangladesh", role: "owner" },
  { name: "Abdullah Al Masum", title: "Branch Head", role: "branch_head" },
  { name: "Md. Saiful Adnan", title: "Operations Manager", role: "operations_manager" },
  { name: "Sonia Akter", title: "Senior Counsellor, Australia and New Zealand", role: "counsellor" },
  { name: "Kaniz Sanjana", title: "Counsellor, multiple destinations", role: "counsellor" },
  { name: "Farjana Lima", title: "Counsellor, multiple destinations", role: "counsellor" },
  { name: "Md. Junaidul Islam", title: "Admissions and Compliance", role: "admissions" },
  { name: "Happy Akter", title: "Digital Marketing Officer", role: "marketing" },
  { name: "Shahnoor Alam Bhuiyan", title: "Accounting and Finance Manager", role: "finance" },
];

// Application steps per destination. Steps marked * make commission claimable.
// These follow each country's usual process; the admissions team should review them in Settings → Workflows.
export const WORKFLOWS: { name: string; destination: string | null; stages: string[]; checklist: [string, string][] }[] = [
  {
    name: "Australia – university or college admission", destination: "AU",
    stages: ["Counselled", "Documents collecting", "Applied", "Offer received", "Genuine Student check", "Offer accepted – deposit and OSHC paid", "CoE issued", "Visa lodged", "Visa granted", "Enrolled*", "Census passed*", "Withdrawn ✗", "Refused ✗"],
    checklist: [["Passport", "passport"], ["Academic transcripts and certificates", "transcript"], ["English test result", "ielts"], ["Statement of purpose / GS statement", "sop"], ["CV", "cv"], ["Financial documents", "financials"], ["Offer letter", "offer"], ["OSHC certificate", "oshc"], ["CoE", "coe"]],
  },
  {
    name: "United Kingdom – university admission", destination: "UK",
    stages: ["Counselled", "Documents collecting", "Applied", "Conditional offer", "Unconditional offer", "Credibility interview", "Deposit paid", "CAS issued", "Visa applied (IHS and biometrics)", "Visa granted", "Enrolled*", "Withdrawn ✗", "Refused ✗"],
    checklist: [["Passport", "passport"], ["Academic transcripts and certificates", "transcript"], ["English test result (UKVI if required)", "ielts"], ["Personal statement", "sop"], ["Reference letters", "reference"], ["Financial documents (28-day rule)", "financials"], ["TB test certificate", "medical"], ["CAS", "cas"]],
  },
  {
    name: "Canada – college or university admission", destination: "CA",
    stages: ["Counselled", "Documents collecting", "Applied", "Letter of Acceptance", "Tuition deposit paid", "Provincial attestation letter", "Study permit applied", "Biometrics done", "Study permit approved", "Enrolled*", "Withdrawn ✗", "Refused ✗"],
    checklist: [["Passport", "passport"], ["Academic transcripts and certificates", "transcript"], ["English test result", "ielts"], ["Statement of purpose", "sop"], ["Financial documents / GIC", "financials"], ["Letter of Acceptance", "offer"], ["Provincial attestation letter", "pal"]],
  },
  {
    name: "USA – university admission", destination: "US",
    stages: ["Counselled", "Documents collecting", "Applied", "Admitted", "Financial documents submitted", "I-20 issued", "SEVIS fee paid", "DS-160 submitted", "Visa interview", "F-1 visa granted", "Enrolled*", "Withdrawn ✗", "Refused ✗"],
    checklist: [["Passport", "passport"], ["Academic transcripts and certificates", "transcript"], ["English test result", "ielts"], ["SAT/GRE/GMAT (if required)", "test_other"], ["Statement of purpose", "sop"], ["Recommendation letters", "reference"], ["Bank statement / affidavit of support", "financials"], ["I-20", "offer"]],
  },
  {
    name: "New Zealand – admission", destination: "NZ",
    stages: ["Counselled", "Documents collecting", "Applied", "Offer received", "Fees paid", "Visa lodged", "Visa granted", "Enrolled*", "Withdrawn ✗", "Refused ✗"],
    checklist: [["Passport", "passport"], ["Academic transcripts and certificates", "transcript"], ["English test result", "ielts"], ["Statement of purpose", "sop"], ["Financial documents", "financials"], ["Offer letter", "offer"]],
  },
  {
    name: "Europe – admission", destination: "EU",
    stages: ["Counselled", "Documents collecting", "Applied", "Offer received", "Tuition / blocked account paid", "Visa appointment booked", "Visa granted", "Enrolled*", "Withdrawn ✗", "Refused ✗"],
    checklist: [["Passport", "passport"], ["Academic transcripts and certificates", "transcript"], ["English test result", "ielts"], ["Motivation letter", "sop"], ["Financial documents / blocked account", "financials"], ["Offer letter", "offer"], ["Attested certificates", "attestation"]],
  },
];

export const INSURERS = ["Allianz Care Australia", "Bupa", "Medibank", "nib", "AHM"];
