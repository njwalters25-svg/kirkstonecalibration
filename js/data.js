// ============================================================
// data.js — Settings defaults & localStorage persistence
// ============================================================

const DEFAULT_SETTINGS = {
  // Service levels — each defines readings, volumes, pricing, and time per pipette
  serviceLevels: [
    {
      id: '2r2v',
      name: '2 readings @ 2 volumes',
      readings: 2,
      volumes: 2,
      chargeSingleChannel: 25.00,
      chargeMultiChannel6: 40.00,
      chargeMultiChannel8: 45.00,
      chargeMultiChannel12: 55.00,
      chargeMultiChannel16: 65.00,
      minutesPerSingleChannel: 15,
      minutesPerMultiChannel6: 22,
      minutesPerMultiChannel8: 25,
      minutesPerMultiChannel12: 30,
      minutesPerMultiChannel16: 35,
    },
    {
      id: '3r3v',
      name: '3 readings @ 3 volumes',
      readings: 3,
      volumes: 3,
      chargeSingleChannel: 35.00,
      chargeMultiChannel6: 55.00,
      chargeMultiChannel8: 60.00,
      chargeMultiChannel12: 72.00,
      chargeMultiChannel16: 85.00,
      minutesPerSingleChannel: 25,
      minutesPerMultiChannel6: 35,
      minutesPerMultiChannel8: 40,
      minutesPerMultiChannel12: 50,
      minutesPerMultiChannel16: 55,
    },
  ],

  // Internal costs per pipette (consumables, certs, wear — same regardless of service level)
  costSingleChannel: 6.00,
  costMultiChannel6: 10.00,
  costMultiChannel8: 12.00,
  costMultiChannel12: 16.00,
  costMultiChannel16: 20.00,

  // Labour
  labourRatePerHour: 35.00,
  workingHoursPerDay: 8,

  // Second person
  secondPersonDayCost: 350,
  secondPersonTimeReduction: 40,   // % reduction in calibration time

  // Travel
  mileageRatePence: 45,
  travelChargeToCustomer: true,
  travelChargePerMile: 0.45,

  // Location & routing
  homePostcode: 'DE75 7UJ',
  londonPremiumPercent: 15,

  // Accommodation
  hotelBudgetDefault: 95.00,
  chargeAccommodationToCustomer: true,
  overnightThresholdMins: 90,           // auto-suggest overnight if travel exceeds this

  // Subsistence (HMRC benchmark scale rates)
  subsistenceOvernightRate: 25,   // 24hr / overnight rate per day
  subsistenceDayTripRate: 10,     // 10hr+ away (two meal) rate per day

  // Discounts
  discountRegularPercent: 5,
  discountContractPercent: 10,

  // Company info (for customer-facing quotes)
  companyName: 'Kirkstone Calibration',
  companyAddress: '',
  companyPhone: '',
  companyEmail: '',
  companyWebsite: '',
  vatNumber: '',
  quoteValidDays: 30,
};

const StorageManager = {
  _prefix: 'kirkstone_',

  loadSettings() {
    try {
      const raw = localStorage.getItem(this._prefix + 'settings');
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      const saved = JSON.parse(raw);
      // Merge scalar fields with defaults; keep saved serviceLevels array as-is
      const merged = { ...DEFAULT_SETTINGS, ...saved };
      if (saved.serviceLevels && Array.isArray(saved.serviceLevels)) {
        merged.serviceLevels = saved.serviceLevels;
      } else {
        merged.serviceLevels = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.serviceLevels));
      }
      return merged;
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
  },

  saveSettings(settings) {
    localStorage.setItem(this._prefix + 'settings', JSON.stringify(settings));
  },

  resetSettings() {
    localStorage.removeItem(this._prefix + 'settings');
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  },

  loadQuoteHistory() {
    try {
      const raw = localStorage.getItem(this._prefix + 'quotes');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  saveQuote(quote) {
    const quotes = this.loadQuoteHistory();
    quotes.unshift(quote);
    localStorage.setItem(this._prefix + 'quotes', JSON.stringify(quotes));
  },

  deleteQuote(id) {
    let quotes = this.loadQuoteHistory();
    quotes = quotes.filter(q => q.id !== id);
    localStorage.setItem(this._prefix + 'quotes', JSON.stringify(quotes));
  },

  saveFormState(formData) {
    sessionStorage.setItem(this._prefix + 'form', JSON.stringify(formData));
  },

  loadFormState() {
    try {
      const raw = sessionStorage.getItem(this._prefix + 'form');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  clearFormState() {
    sessionStorage.removeItem(this._prefix + 'form');
  },

  saveLogo(dataUrl) {
    try { localStorage.setItem(this._prefix + 'logo', dataUrl); } catch {}
  },

  loadLogo() {
    try { return localStorage.getItem(this._prefix + 'logo') || null; } catch { return null; }
  },

  clearLogo() {
    localStorage.removeItem(this._prefix + 'logo');
  },

  loadCustomers() {
    try {
      const raw = localStorage.getItem(this._prefix + 'customers');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  saveCustomers(customers) {
    localStorage.setItem(this._prefix + 'customers', JSON.stringify(customers));
  },

  upsertCustomer(customer) {
    const customers = this.loadCustomers();
    const idx = customers.findIndex(c => c.id === customer.id);
    if (idx >= 0) customers[idx] = customer;
    else customers.push(customer);
    customers.sort((a, b) => a.name.localeCompare(b.name));
    this.saveCustomers(customers);
    return customers;
  },
};
