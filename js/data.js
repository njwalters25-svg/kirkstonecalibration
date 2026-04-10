// ============================================================
// data.js — Settings defaults & localStorage persistence
// ============================================================

const DEFAULT_SETTINGS = {
  // Charges to customer (GBP per pipette)
  chargeSingleChannel: 25.00,
  chargeMultiChannel8: 45.00,
  chargeMultiChannel12: 55.00,
  chargeMultiChannel16: 65.00,

  // Internal costs per pipette (consumables, certs, wear)
  costSingleChannel: 6.00,
  costMultiChannel8: 12.00,
  costMultiChannel12: 16.00,
  costMultiChannel16: 20.00,

  // Labour
  labourRatePerHour: 35.00,

  // Travel
  mileageRatePence: 45,
  travelChargeToCustomer: true,       // whether to add travel charge to quote
  travelChargePerMile: 0.45,          // GBP per mile charged to customer (if enabled)

  // Location premiums
  londonPremiumPercent: 15,

  // Accommodation
  hotelBudgetDefault: 95.00,
  chargeAccommodationToCustomer: true,

  // Service level
  expressPremiumPercent: 25,

  // Discounts
  discountRegularPercent: 5,
  discountContractPercent: 10,

  // Pipette time estimates (minutes per pipette, for auto-estimating cal time)
  minutesPerSingleChannel: 15,
  minutesPerMultiChannel: 25,
};

const StorageManager = {
  _prefix: 'kirkstone_',

  loadSettings() {
    try {
      const raw = localStorage.getItem(this._prefix + 'settings');
      if (!raw) return { ...DEFAULT_SETTINGS };
      const saved = JSON.parse(raw);
      // Merge with defaults so new fields get their default value
      return { ...DEFAULT_SETTINGS, ...saved };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },

  saveSettings(settings) {
    localStorage.setItem(this._prefix + 'settings', JSON.stringify(settings));
  },

  resetSettings() {
    localStorage.removeItem(this._prefix + 'settings');
    return { ...DEFAULT_SETTINGS };
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
  }
};
