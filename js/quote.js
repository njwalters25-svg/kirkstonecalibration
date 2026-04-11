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
  let totalSC = 0, totalMC8 = 0, totalMC12 = 0, totalMC16 = 0;
  let totalPipetteCharges = 0;
  let totalPipetteCosts = 0;
  let totalEstimatedMins = 0;

  lines.forEach(line => {
    const sl = getServiceLevel(line.serviceLevelId, settings);
    const sc = line.singleChannelCount || 0;
    const mc8 = line.multiChannel8Count || 0;
    const mc12 = line.multiChannel12Count || 0;
    const mc16 = line.multiChannel16Count || 0;

    const chargeSingle = sc * (sl ? sl.chargeSingleChannel : 0);
    const chargeMulti8 = mc8 * (sl ? sl.chargeMultiChannel8 : 0);
    const chargeMulti12 = mc12 * (sl ? sl.chargeMultiChannel12 : 0);
    const chargeMulti16 = mc16 * (sl ? sl.chargeMultiChannel16 : 0);
    const chargeTotal = chargeSingle + chargeMulti8 + chargeMulti12 + chargeMulti16;

    const minsPerSC = sl ? sl.minutesPerSingleChannel : 0;
    const minsPerMC = sl ? sl.minutesPerMultiChannel : 0;
    const estimatedMins = (sc * minsPerSC) + ((mc8 + mc12 + mc16) * minsPerMC);

    result.lineResults.push({
      serviceLevelName: sl ? sl.name : 'Unknown',
      singleCount: sc,
      multi8Count: mc8,
      multi12Count: mc12,
      multi16Count: mc16,
      chargeSingle,
      chargeMulti8,
      chargeMulti12,
      chargeMulti16,
      chargeTotal,
      estimatedMins,
    });

    totalSC += sc;
    totalMC8 += mc8;
    totalMC12 += mc12;
    totalMC16 += mc16;
    totalPipetteCharges += chargeTotal;
    totalEstimatedMins += estimatedMins;
  });

  result.totalPipettes = totalSC + totalMC8 + totalMC12 + totalMC16;
  result.totalChannels = totalSC + (totalMC8 * 8) + (totalMC12 * 12) + (totalMC16 * 16);
  result.pipetteChargesTotal = totalPipetteCharges;
  result.estimatedCalMinutes = totalEstimatedMins;

  // --- Second person ---
  const secondPerson = !!input.secondPerson;
  const timeReduction = secondPerson ? (settings.secondPersonTimeReduction || 40) : 0;
  result.secondPerson = secondPerson;
  result.timeReductionPercent = timeReduction;

  // --- Core time values ---
  const travelMinutes = input.travelTimeMinutes || 0;
  const calMinutes = input.calibrationTimeMinutes || 0;
  const baseJobMins = calMinutes || result.estimatedCalMinutes;
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

  result.timePlan = {
    travelOutMins,
    travelReturnMins,
    travelTotalMins,
    jobMins,
    totalMins: travelTotalMins + jobMins,
    workMinsPerDay,
    travelDayBefore: !!input.travelDayBefore,
  };

  if (input.travelDayBefore) {
    const jobDays = Math.ceil(jobMins / workMinsPerDay) || 0;
    const lastDayJobMins = jobMins - ((jobDays - 1) * workMinsPerDay);
    const lastDaySpare = workMinsPerDay - lastDayJobMins;
    const returnFitsInLastDay = travelReturnMins <= lastDaySpare;

    result.timePlan.travelOutDays = 1;
    result.timePlan.jobDays = jobDays;
    result.timePlan.travelReturnDays = returnFitsInLastDay ? 0 : 1;
    result.timePlan.totalDays = 1 + jobDays + (returnFitsInLastDay ? 0 : 1);
    result.timePlan.returnNote = returnFitsInLastDay
      ? 'Return travel fits into last job day'
      : 'Separate return travel day needed';
  } else {
    const totalMins = travelOutMins + jobMins + travelReturnMins;
    const totalDays = Math.ceil(totalMins / workMinsPerDay) || 0;

    result.timePlan.travelOutDays = 0;
    result.timePlan.jobDays = 0;
    result.timePlan.travelReturnDays = 0;
    result.timePlan.totalDays = totalDays;
    result.timePlan.returnNote = '';
  }

  // --- Auto-suggest overnight & estimate nights ---
  const threshold = settings.overnightThresholdMins || 90;
  const needsOvernight = travelMinutes >= threshold || result.timePlan.totalDays > 1 || input.travelDayBefore;

  // Split nights into travel night (day before) and job nights
  // Job nights = on-site days minus 1 (sleep between working days)
  let jobNights = 0;
  if (input.travelDayBefore) {
    // On-site days from the time plan
    const onSiteDays = result.timePlan.jobDays || 0;
    // If return doesn't fit in last day, that's an extra day away but not an extra job night
    // (you drive home that day, you don't need a hotel)
    jobNights = onSiteDays > 1 ? onSiteDays - 1 : 0;
  } else {
    // Without travel day before, total days includes everything
    jobNights = result.timePlan.totalDays > 1 ? result.timePlan.totalDays - 1 : 0;
  }

  const travelNight = input.travelDayBefore ? 1 : 0;
  const suggestedNights = travelNight + jobNights;

  result.overnightSuggested = needsOvernight;
  result.suggestedNights = suggestedNights;
  result.travelNight = travelNight;
  result.jobNights = jobNights;

  const overnightStay = input.overnightStay;
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
  result.roundTripMiles = roundTripMiles;

  if (settings.travelChargeToCustomer) {
    result.travelCharge = roundTripMiles * settings.travelChargePerMile;
  } else {
    result.travelCharge = 0;
  }

  // --- Revenue: Accommodation charge ---
  if (overnightStay && settings.chargeAccommodationToCustomer) {
    result.accommodationCharge = totalHotelCost;
  } else {
    result.accommodationCharge = 0;
  }

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
    (totalMC8 * settings.costMultiChannel8) +
    (totalMC12 * settings.costMultiChannel12) +
    (totalMC16 * settings.costMultiChannel16);

  result.costTravel = roundTripMiles * (settings.mileageRatePence / 100);
  result.costAccommodation = totalHotelCost;
  result.costLabourCalibration = (calMinutes / 60) * settings.labourRatePerHour;
  result.costLabourTravel = (travelMinutes / 60) * settings.labourRatePerHour;

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
