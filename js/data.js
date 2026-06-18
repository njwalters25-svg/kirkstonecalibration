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

  partsCatalog: [
    { id: 'gilson_pipetteman_classic_p2_seal_p2', pipette: 'Gilson Pipetteman Classic P2', description: 'Seal P2', name: 'Gilson Pipetteman Classic P2 Seal P2', costPerUnit: 2.44, pricePerUnit: 4.88 },
    { id: 'gilson_pipetteman_classic_p10_seal_p10', pipette: 'Gilson Pipetteman Classic P10', description: 'Seal P10', name: 'Gilson Pipetteman Classic P10 Seal P10', costPerUnit: 2.44, pricePerUnit: 4.88 },
    { id: 'gilson_pipetteman_classic_p20_seal_p20', pipette: 'Gilson Pipetteman Classic P20', description: 'Seal P20', name: 'Gilson Pipetteman Classic P20 Seal P20', costPerUnit: 2.44, pricePerUnit: 4.88 },
    { id: 'gilson_pipetteman_classic_p100_seal_p100', pipette: 'Gilson Pipetteman Classic P100', description: 'Seal P100', name: 'Gilson Pipetteman Classic P100 Seal P100', costPerUnit: 2.44, pricePerUnit: 4.88 },
    { id: 'gilson_pipetteman_classic_p200_seal_p200', pipette: 'Gilson Pipetteman Classic P200', description: 'Seal P200', name: 'Gilson Pipetteman Classic P200 Seal P200', costPerUnit: 2.44, pricePerUnit: 4.88 },
    { id: 'gilson_pipetteman_classic_p1000_seal_p1000', pipette: 'Gilson Pipetteman Classic P1000', description: 'Seal P1000', name: 'Gilson Pipetteman Classic P1000 Seal P1000', costPerUnit: 2.44, pricePerUnit: 4.88 },
    { id: 'gilson_pipetteman_classic_p5000_seal_p5000', pipette: 'Gilson Pipetteman Classic P5000', description: 'Seal P5000', name: 'Gilson Pipetteman Classic P5000 Seal P5000', costPerUnit: 3.77, pricePerUnit: 7.54 },
    { id: 'gilson_pipetteman_classic_p10000_seal_p10000', pipette: 'Gilson Pipetteman Classic P10000', description: 'Seal P10000', name: 'Gilson Pipetteman Classic P10000 Seal P10000', costPerUnit: 12.77, pricePerUnit: 25.54 },
    { id: 'gilson_pipetteman_classic_p2_o_ring_p2_p10', pipette: 'Gilson Pipetteman Classic P2', description: 'O-Ring P2/P10', name: 'Gilson Pipetteman Classic P2 O-Ring P2/P10', costPerUnit: 0.74, pricePerUnit: 1.48 },
    { id: 'gilson_pipetteman_classic_p20_o_ring_p20', pipette: 'Gilson Pipetteman Classic P20', description: 'O-Ring P20', name: 'Gilson Pipetteman Classic P20 O-Ring P20', costPerUnit: 0.74, pricePerUnit: 1.48 },
    { id: 'gilson_pipetteman_classic_p100_o_ring_p100', pipette: 'Gilson Pipetteman Classic P100', description: 'O-Ring P100', name: 'Gilson Pipetteman Classic P100 O-Ring P100', costPerUnit: 0.74, pricePerUnit: 1.48 },
    { id: 'gilson_pipetteman_classic_p200_o_ring_p200', pipette: 'Gilson Pipetteman Classic P200', description: 'O-Ring P200', name: 'Gilson Pipetteman Classic P200 O-Ring P200', costPerUnit: 0.74, pricePerUnit: 1.48 },
    { id: 'gilson_pipetteman_classic_p1000_o_ring_p1000', pipette: 'Gilson Pipetteman Classic P1000', description: 'O-Ring P1000', name: 'Gilson Pipetteman Classic P1000 O-Ring P1000', costPerUnit: 0.74, pricePerUnit: 1.48 },
    { id: 'gilson_pipetteman_classic_p5000_o_ring_p5000', pipette: 'Gilson Pipetteman Classic P5000', description: 'O-Ring P5000', name: 'Gilson Pipetteman Classic P5000 O-Ring P5000', costPerUnit: 2.51, pricePerUnit: 5.02 },
    { id: 'gilson_pipetteman_classic_p10000_o_ring_p10000', pipette: 'Gilson Pipetteman Classic P10000', description: 'O-Ring P10000', name: 'Gilson Pipetteman Classic P10000 O-Ring P10000', costPerUnit: 2.51, pricePerUnit: 5.02 },
    { id: 'gilson_pipetteman_classic_p2_tip_holder_p2', pipette: 'Gilson Pipetteman Classic P2', description: 'Tip Holder P2', name: 'Gilson Pipetteman Classic P2 Tip Holder P2', costPerUnit: 6.58, pricePerUnit: 13.16 },
    { id: 'gilson_pipetteman_classic_p10_tip_holder_p10', pipette: 'Gilson Pipetteman Classic P10', description: 'Tip Holder P10', name: 'Gilson Pipetteman Classic P10 Tip Holder P10', costPerUnit: 6.58, pricePerUnit: 13.16 },
    { id: 'gilson_pipetteman_classic_p20_tip_holder_p20', pipette: 'Gilson Pipetteman Classic P20', description: 'Tip Holder P20', name: 'Gilson Pipetteman Classic P20 Tip Holder P20', costPerUnit: 6.58, pricePerUnit: 13.16 },
    { id: 'gilson_pipetteman_classic_p100_tip_holder_p100', pipette: 'Gilson Pipetteman Classic P100', description: 'Tip Holder P100', name: 'Gilson Pipetteman Classic P100 Tip Holder P100', costPerUnit: 6.58, pricePerUnit: 13.16 },
    { id: 'gilson_pipetteman_classic_p200_tip_holder_p200', pipette: 'Gilson Pipetteman Classic P200', description: 'Tip Holder P200', name: 'Gilson Pipetteman Classic P200 Tip Holder P200', costPerUnit: 6.58, pricePerUnit: 13.16 },
    { id: 'gilson_pipetteman_classic_p1000_tip_holder_p1000', pipette: 'Gilson Pipetteman Classic P1000', description: 'Tip Holder P1000', name: 'Gilson Pipetteman Classic P1000 Tip Holder P1000', costPerUnit: 6.58, pricePerUnit: 13.16 },
    { id: 'gilson_pipetteman_classic_rubber_friction_ring', pipette: 'Gilson Pipetteman Classic', description: 'Rubber Friction Ring', name: 'Gilson Pipetteman Classic Rubber Friction Ring', costPerUnit: 0.96, pricePerUnit: 1.92 },
    { id: 'gilson_pipetteman_classic_tip_ejector_kit', pipette: 'Gilson Pipetteman Classic', description: 'Tip Ejector Kit', name: 'Gilson Pipetteman Classic Tip Ejector Kit', costPerUnit: 40.98, pricePerUnit: 81.96 },
    { id: 'gilson_pipetteman_classic_p20_tip_ejector_p20', pipette: 'Gilson Pipetteman Classic P20', description: 'Tip Ejector P20', name: 'Gilson Pipetteman Classic P20 Tip Ejector P20', costPerUnit: 13.83, pricePerUnit: 27.66 },
    { id: 'gilson_pipetteman_classic_p200_tip_ejector_p200', pipette: 'Gilson Pipetteman Classic P200', description: 'Tip Ejector P200', name: 'Gilson Pipetteman Classic P200 Tip Ejector P200', costPerUnit: 13.83, pricePerUnit: 27.66 },
    { id: 'gilson_pipetteman_l_p200_volumeter_l_p200', pipette: 'Gilson Pipetteman L P200', description: 'Volumeter L P200', name: 'Gilson Pipetteman L P200 Volumeter L P200', costPerUnit: 41.00, pricePerUnit: 82.00 },
    { id: 'biohit_sartorius_mline_200ul_piston_200ul', pipette: 'Biohit/Sartorius mLine 200ul', description: 'Piston 200ul', name: 'Biohit/Sartorius mLine 200ul Piston 200ul', costPerUnit: 40.30, pricePerUnit: 80.60 },
    { id: 'sartorius_battery', pipette: 'Sartorius', description: 'Battery', name: 'Sartorius battery', costPerUnit: 23.30, pricePerUnit: 40.78 },
    { id: 'sartorius_300ul_tip_holder', pipette: 'Sartorius', description: '300ul Tip holder', name: 'Sartorius 300ul Tip holder', costPerUnit: 41.87, pricePerUnit: 73.27 },
  ],

  // Internal costs per pipette (consumables, certs, wear — same regardless of service level)
  costSingleChannel: 6.00,
  costMultiChannel6: 10.00,
  costMultiChannel8: 12.00,
  costMultiChannel12: 16.00,
  costMultiChannel16: 20.00,
  stickerCostPerPipette: 0.10,

  // Labour
  labourRatePerHour: 35.00,
  workingHoursPerDay: 8,

  // Second person
  secondPersonDayCost: 350,
  secondPersonTimeReduction: 40,   // % reduction in calibration time

  // Travel
  mileageRatePence: 55,
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

function normalizeMileageRatePence(value) {
  const parsed = parseFloat(value);
  if (!parsed || parsed === 45) return 55;
  return parsed;
}

const StorageManager = {
  _prefix: 'kirkstone_',

  loadSettings() {
    try {
      const raw = localStorage.getItem(this._prefix + 'settings');
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      const saved = JSON.parse(raw);
      // Merge scalar fields with defaults; keep saved serviceLevels array as-is
      const merged = { ...DEFAULT_SETTINGS, ...saved };
      merged.mileageRatePence = normalizeMileageRatePence(merged.mileageRatePence);
      if (saved.serviceLevels && Array.isArray(saved.serviceLevels)) {
        merged.serviceLevels = saved.serviceLevels;
      } else {
        merged.serviceLevels = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.serviceLevels));
      }
      if (Array.isArray(saved.partsCatalog) && saved.partsCatalog.length > 0) {
        merged.partsCatalog = saved.partsCatalog;
      } else {
        merged.partsCatalog = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.partsCatalog));
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

  saveQuoteHistory(quotes) {
    localStorage.setItem(this._prefix + 'quotes', JSON.stringify(quotes));
  },

  saveQuote(quote) {
    const quotes = this.loadQuoteHistory();
    quotes.unshift(quote);
    this.saveQuoteHistory(quotes);
  },

  updateQuote(quote) {
    const quotes = this.loadQuoteHistory();
    const index = quotes.findIndex(q => q.id === quote.id);
    if (index >= 0) {
      quotes[index] = quote;
    } else {
      quotes.unshift(quote);
    }
    this.saveQuoteHistory(quotes);
  },

  deleteQuote(id) {
    let quotes = this.loadQuoteHistory();
    quotes = quotes.filter(q => q.id !== id);
    this.saveQuoteHistory(quotes);
  },

  loadJobs() {
    try {
      const raw = localStorage.getItem(this._prefix + 'jobs');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  saveJobs(jobs) {
    localStorage.setItem(this._prefix + 'jobs', JSON.stringify(jobs));
  },

  saveJob(job) {
    const jobs = this.loadJobs();
    const index = jobs.findIndex(j => j.id === job.id);
    if (index >= 0) jobs[index] = job;
    else jobs.unshift(job);
    this.saveJobs(jobs);
  },

  deleteJob(id) {
    this.saveJobs(this.loadJobs().filter(j => j.id !== id));
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
