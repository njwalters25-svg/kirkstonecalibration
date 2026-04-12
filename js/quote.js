// ============================================================
// quote.js — Pure calculation engine, no DOM access
// ============================================================

function getServiceLevel(serviceLevelId, settings) {
  if (!settings.serviceLevels || settings.serviceLevels.length === 0) return null;
  return settings.serviceLevels.find(sl => sl.id === serviceLevelId)
    || settings.serviceLevels[0];
}

function calculateQuote(input, settings) {
  const result = {};
  const lines = input.pipetteLines || [];

  // --- Process each pipette line ---
  result.lineResults = [];
  let totalSC = 0, totalMC6 = 0, totalMC8 = 0, totalMC12 = 0, totalMC16 = 0;
  let totalPipetteCharges = 0;
  let totalPipetteCosts = 0;
  let totalEstimatedMins = 0;

  lines.forEach(line => {
    const sl = getServiceLevel(line.serviceLevelId, settings);
    const sc = line.singleChannelCount || 0;
    const mc6 = line.multiChannel6Count || 0;
    const mc8 = line.multiChannel8Count || 0;
    const mc12 = line.multiChannel12Count || 0;
    const mc16 = line.multiChannel16Count || 0;

    const chargeSingle = sc * (sl ? sl.chargeSingleChannel : 0);
    const chargeMulti6 = mc6 * (sl ? sl.chargeMultiChannel6 : 0);
    const chargeMulti8 = mc8 * (sl ? sl.chargeMultiChannel8 : 0);
    const chargeMulti12 = mc12 * (sl ? sl.chargeMultiChannel12 : 0);
    const chargeMulti16 = mc16 * (sl ? sl.chargeMultiChannel16 : 0);
    const chargeTotal = chargeSingle + chargeMulti6 + chargeMulti8 + chargeMulti12 + chargeMulti16;

    const minsPerSC = sl ? sl.minutesPerSingleChannel : 0;
    const minsPerMC6 = sl ? (sl.minutesPerMultiChannel6 || sl.minutesPerMultiChannel || 0) : 0;
    const minsPerMC8 = sl ? (sl.minutesPerMultiChannel8 || sl.minutesPerMultiChannel || 0) : 0;
    const minsPerMC12 = sl ? (sl.minutesPerMultiChannel12 || sl.minutesPerMultiChannel || 0) : 0;
    const minsPerMC16 = sl ? (sl.minutesPerMultiChannel16 || sl.minutesPerMultiChannel || 0) : 0;
    const estimatedMins = (sc * minsPerSC) + (mc6 * minsPerMC6) + (mc8 * minsPerMC8) + (mc12 * minsPerMC12) + (mc16 * minsPerMC16);

    result.lineResults.push({
      serviceLevelName: sl ? sl.name : 'Unknown',
      singleCount: sc,
      multi6Count: mc6,
      multi8Count: mc8,
      multi12Count: mc12,
      multi16Count: mc16,
      chargeSingle,
      chargeMulti6,
      chargeMulti8,
      chargeMulti12,
      chargeMulti16,
      chargeTotal,
      estimatedMins,
    });

    totalSC += sc;
    totalMC6 += mc6;
    totalMC8 += mc8;
    totalMC12 += mc12;
    totalMC16 += mc16;
    totalPipetteCharges += chargeTotal;
    totalEstimatedMins += estimatedMins;
  });

  result.totalPipettes = totalSC + totalMC6 + totalMC8 + totalMC12 + totalMC16;
  result.totalChannels = totalSC + (totalMC6 * 6) + (totalMC8 * 8) + (totalMC12 * 12) + (totalMC16 * 16);
  result.pipetteChargesTotal = totalPipetteCharges;
  result.estimatedCalMinutes = totalEstimatedMins;

  // --- New job (extra 2 mins per pipette for system entry) ---
  const newJob = !!input.newJob;
  const newJobExtraMins = newJob ? result.totalPipettes * 2 : 0;
  result.newJob = newJob;
  result.newJobExtraMins = newJobExtraMins;

  // --- Second person ---
  const secondPerson = !!input.secondPerson;
  const timeReduction = secondPerson ? (settings.secondPersonTimeReduction || 40) : 0;
  result.secondPerson = secondPerson;
  result.timeReductionPercent = timeReduction;

  // --- Core time values ---
  const travelMinutes = input.travelTimeMinutes || 0;
  const calMinutes = input.calibrationTimeMinutes || 0;
  // New job extra applies on top of either manual or estimated time
  const baseJobMins = (calMinutes || result.estimatedCalMinutes) + newJobExtraMins;
  // Apply second person time reduction to calibration work only
  const jobMins = secondPerson
    ? Math.round(baseJobMins * (1 - timeReduction / 100))
    : baseJobMins;
  result.baseJobMins = baseJobMins;
  const workMinsPerDay = (settings.workingHoursPerDay || 8) * 60;

  // --- Time plan ---
  const travelOutMins = travelMinutes;
  const travelReturnMins = travelMinutes;
  const travelTotalMins = travelOutMins + travelReturnMins;
  const hotelToWorkMins = (!!input.overnightStay) ? (input.hotelToWorkMinutes || 0) : 0;

  result.timePlan = {
    travelOutMins,
    travelReturnMins,
    travelTotalMins,
    hotelToWorkMins,
    jobMins,
    totalMins: travelTotalMins + jobMins, // updated below for overnight with hotel commute
    workMinsPerDay,
    travelDayBefore: !!input.travelDayBefore,
  };

  // --- Days calculation ---
  const overnightStay = !!input.overnightStay;
  const travelDayBefore = !!input.travelDayBefore;

  let totalDays;
  if (overnightStay && hotelToWorkMins > 0) {
    // Overnight with daily hotel-to-work commute
    // Each working day loses 2 × hotelToWork to commuting (hotel→work + work→hotel)
    // except first/last days which differ depending on travel pattern
    const dailyCommute = hotelToWorkMins * 2;
    const workablePerDay = workMinsPerDay - dailyCommute;

    if (workablePerDay <= 0) {
      totalDays = jobMins > 0 ? Math.ceil(jobMins / workMinsPerDay) + 1 : 0;
    } else if (travelDayBefore) {
      // Travel day before: home→hotel is separate (not a working day)
      // Working days: hotel→work→hotel, last day: hotel→work→home
      // n ≥ (jobMins + travelReturn - hotelToWork) / workablePerDay
      const totalToSchedule = jobMins + travelReturnMins - hotelToWorkMins;
      totalDays = Math.ceil(totalToSchedule / workablePerDay) || 0;
    } else {
      // No travel day before: day 1 is home→work→hotel
      // Day 1: available = workMinsPerDay - travelOut - hotelToWork
      // Middle days: available = workMinsPerDay - 2*hotelToWork
      // Last day: available = workMinsPerDay - hotelToWork - travelReturn
      // n ≥ (travelOut + travelReturn - 2*hotelToWork + jobMins) / workablePerDay
      const totalToSchedule = travelOutMins + travelReturnMins - dailyCommute + jobMins;
      totalDays = Math.ceil(totalToSchedule / workablePerDay) || 0;
    }

    // Ensure at least 1 day if there's work
    if (totalDays < 1 && jobMins > 0) totalDays = 1;

    // Update total time to include hotel commutes
    // No travel day before: travelOut + (n-1)*2*htw + travelReturn + jobMins (for n≥2), or travelOut+travelReturn+jobMins (n=1)
    // Travel day before: travelOut + (2n-1)*htw + travelReturn + jobMins (for n≥1)
    let totalHotelCommuteMins;
    if (travelDayBefore) {
      totalHotelCommuteMins = totalDays > 0 ? hotelToWorkMins * (2 * totalDays - 1) : 0;
    } else {
      totalHotelCommuteMins = totalDays > 1 ? dailyCommute * (totalDays - 1) : 0;
    }
    result.timePlan.totalHotelCommuteMins = totalHotelCommuteMins;
    result.timePlan.totalMins = travelOutMins + travelReturnMins + jobMins + totalHotelCommuteMins;
  } else if (overnightStay) {
    // Overnight but no hotel-to-work time specified — original logic
    const totalWorkMins = travelOutMins + jobMins + travelReturnMins;
    totalDays = Math.ceil(totalWorkMins / workMinsPerDay) || 0;
    result.timePlan.totalHotelCommuteMins = 0;
  } else {
    // No overnight: commuting daily from home
    const workablePerDay = workMinsPerDay - travelOutMins - travelReturnMins;
    if (workablePerDay > 0) {
      totalDays = Math.ceil(jobMins / workablePerDay) || 0;
    } else {
      totalDays = jobMins > 0 ? Math.ceil(jobMins / workMinsPerDay) + 1 : 0;
    }
    result.timePlan.totalHotelCommuteMins = 0;
  }

  // How many daily commutes (round trips from home — for mileage)
  const commuteTrips = (!overnightStay && totalDays > 0) ? totalDays : 1;
  result.commuteTrips = commuteTrips;

  result.timePlan.totalDays = totalDays;

  // --- Auto-suggest overnight & estimate nights ---
  const threshold = settings.overnightThresholdMins || 90;
  const needsOvernight = travelMinutes >= threshold || totalDays > 1 || input.travelDayBefore;

  // Job nights = days minus 1 (sleep between working days)
  const jobNights = totalDays > 1 ? totalDays - 1 : 0;

  // Travel day before = extra hotel night (evening travel, not a working day)
  const travelNight = input.travelDayBefore ? 1 : 0;
  const suggestedNights = jobNights + travelNight;

  result.overnightSuggested = needsOvernight;
  result.suggestedNights = suggestedNights;
  result.travelNight = travelNight;
  result.jobNights = jobNights;

  const nights = overnightStay ? (input.nights || suggestedNights || 1) : 0;
  const hotelCostPerNight = overnightStay
    ? (input.hotelCost || settings.hotelBudgetDefault)
    : 0;
  const totalHotelCost = hotelCostPerNight * nights;

  result.nights = nights;
  result.hotelCostPerNight = hotelCostPerNight;

  // --- Revenue: Travel charge ---
  const distanceMiles = input.travelDistanceMiles || 0;
  const roundTripMiles = distanceMiles * 2;
  const homeTripMiles = roundTripMiles * commuteTrips;

  // Hotel-to-work daily commute mileage (when staying overnight)
  const hotelToWorkDistanceMiles = (overnightStay ? (input.hotelToWorkDistanceMiles || 0) : 0);
  let hotelCommuteTotalMiles = 0;
  if (overnightStay && hotelToWorkDistanceMiles > 0 && totalDays > 0) {
    const hotelToWorkRoundTrip = hotelToWorkDistanceMiles * 2;
    if (travelDayBefore) {
      // Every working day: hotel→work, and all but last: work→hotel
      // Last day: work→home (already counted in homeTripMiles)
      // So: (totalDays - 1) full round trips + 1 one-way (last day morning)
      hotelCommuteTotalMiles = (totalDays - 1) * hotelToWorkRoundTrip + hotelToWorkDistanceMiles;
    } else {
      // Day 1: work→hotel (one way). Middle: hotel→work→hotel (round trips). Last: hotel→work (one way).
      // For totalDays >= 2: (totalDays - 1) round trips
      // For totalDays == 1: no hotel commute (go there and back home same pattern)
      hotelCommuteTotalMiles = totalDays > 1 ? (totalDays - 1) * hotelToWorkRoundTrip : 0;
    }
  }
  result.hotelToWorkDistanceMiles = hotelToWorkDistanceMiles;
  result.hotelCommuteTotalMiles = Math.round(hotelCommuteTotalMiles * 10) / 10;

  const totalTripMiles = homeTripMiles + hotelCommuteTotalMiles;
  result.roundTripMiles = roundTripMiles;
  result.homeTripMiles = homeTripMiles;
  result.totalTripMiles = Math.round(totalTripMiles * 10) / 10;

  if (settings.travelChargeToCustomer) {
    result.travelCharge = totalTripMiles * settings.travelChargePerMile;
  } else {
    result.travelCharge = 0;
  }

  // --- Revenue: Accommodation charge ---
  if (overnightStay && settings.chargeAccommodationToCustomer) {
    result.accommodationCharge = totalHotelCost;
  } else {
    result.accommodationCharge = 0;
  }

  result.travelDayBeforeCharge = 0;

  // --- Subtotal ---
  let subtotal = result.pipetteChargesTotal + result.travelCharge + result.accommodationCharge;

  // --- London premium ---
  if (input.isLondon) {
    result.londonPremium = result.pipetteChargesTotal * (settings.londonPremiumPercent / 100);
  } else {
    result.londonPremium = 0;
  }

  result.subtotalBeforeDiscount = subtotal + result.londonPremium;

  // --- Discount ---
  let discountPercent = 0;
  result.discountLabel = 'None';

  switch (input.discountType) {
    case 'regular':
      discountPercent = settings.discountRegularPercent;
      result.discountLabel = `Regular customer (${discountPercent}%)`;
      break;
    case 'contract':
      discountPercent = settings.discountContractPercent;
      result.discountLabel = `Contract-winning (${discountPercent}%)`;
      break;
    case 'custom':
      discountPercent = input.customDiscountPercent || 0;
      result.discountLabel = `Custom (${discountPercent}%)`;
      break;
    default:
      discountPercent = 0;
      result.discountLabel = 'None';
  }

  result.discountPercent = discountPercent;
  result.discountAmount = result.subtotalBeforeDiscount * (discountPercent / 100);
  result.totalQuotePrice = result.subtotalBeforeDiscount - result.discountAmount;

  // --- Internal costs ---
  result.costPipettesTotal =
    (totalSC * settings.costSingleChannel) +
    (totalMC6 * settings.costMultiChannel6) +
    (totalMC8 * settings.costMultiChannel8) +
    (totalMC12 * settings.costMultiChannel12) +
    (totalMC16 * settings.costMultiChannel16);

  result.costTravel = totalTripMiles * (settings.mileageRatePence / 100);
  result.costAccommodation = totalHotelCost;
  result.costLabourCalibration = (calMinutes / 60) * settings.labourRatePerHour;
  // Travel labour: home travel + hotel commute travel
  const homeTravelTotalMins = travelMinutes * 2 * commuteTrips;
  const hotelCommuteTotalMins = result.timePlan.totalHotelCommuteMins || 0;
  result.costLabourTravel = ((homeTravelTotalMins + hotelCommuteTotalMins) / 60) * settings.labourRatePerHour;

  // Second person cost: per day on site (not travel days)
  const onSiteDays = Math.ceil(jobMins / workMinsPerDay) || 0;
  result.secondPersonDays = secondPerson ? onSiteDays : 0;
  result.costSecondPerson = secondPerson
    ? onSiteDays * (settings.secondPersonDayCost || 350)
    : 0;

  result.totalInternalCost =
    result.costPipettesTotal +
    result.costTravel +
    result.costAccommodation +
    result.costLabourCalibration +
    result.costLabourTravel +
    result.costSecondPerson;

  // --- Profit ---
  result.profitAmount = result.totalQuotePrice - result.totalInternalCost;
  result.profitMarginPercent = result.totalQuotePrice > 0
    ? (result.profitAmount / result.totalQuotePrice) * 100
    : 0;

  // --- Notes ---
  result.notes = input.notes || '';

  return result;
}
