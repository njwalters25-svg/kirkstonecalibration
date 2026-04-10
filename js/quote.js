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

  // --- Resolve service level ---
  const sl = getServiceLevel(input.serviceLevelId, settings);
  result.serviceLevelName = sl ? sl.name : 'Unknown';
  result.serviceLevelReadings = sl ? sl.readings : 0;
  result.serviceLevelVolumes = sl ? sl.volumes : 0;

  // --- Pipette counts ---
  const sc = input.singleChannelCount || 0;
  const mc8 = input.multiChannel8Count || 0;
  const mc12 = input.multiChannel12Count || 0;
  const mc16 = input.multiChannel16Count || 0;
  result.totalPipettes = sc + mc8 + mc12 + mc16;
  result.totalChannels = sc + (mc8 * 8) + (mc12 * 12) + (mc16 * 16);

  // --- Estimated calibration time (from service level) ---
  const minsPerSC = sl ? sl.minutesPerSingleChannel : 0;
  const minsPerMC = sl ? sl.minutesPerMultiChannel : 0;
  result.estimatedCalMinutes =
    (sc * minsPerSC) + ((mc8 + mc12 + mc16) * minsPerMC);

  // --- Core time values ---
  const travelMinutes = input.travelTimeMinutes || 0;
  const calMinutes = input.calibrationTimeMinutes || 0;
  const jobMins = calMinutes || result.estimatedCalMinutes;
  const workMinsPerDay = (settings.workingHoursPerDay || 8) * 60;

  // --- Time plan (computed early — needed for hotel estimate) ---
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
  const needsOvernight = travelMinutes >= threshold || result.timePlan.totalDays > 1;
  // Nights = total days minus 1 (you sleep between working days)
  // If travelling day before, that's an extra night
  const suggestedNights = result.timePlan.totalDays > 1
    ? result.timePlan.totalDays - 1
    : 0;

  result.overnightSuggested = needsOvernight;
  result.suggestedNights = suggestedNights;

  // Use manual override if provided, otherwise use suggestion
  const overnightStay = input.overnightStay;
  const nights = overnightStay ? (input.nights || suggestedNights || 1) : 0;
  const hotelCostPerNight = overnightStay
    ? (input.hotelCost || settings.hotelBudgetDefault)
    : 0;
  const totalHotelCost = hotelCostPerNight * nights;

  result.nights = nights;
  result.hotelCostPerNight = hotelCostPerNight;

  // --- Revenue: Pipette charges (from service level) ---
  result.pipetteChargesSingle = sc * (sl ? sl.chargeSingleChannel : 0);
  result.pipetteChargesMulti8 = mc8 * (sl ? sl.chargeMultiChannel8 : 0);
  result.pipetteChargesMulti12 = mc12 * (sl ? sl.chargeMultiChannel12 : 0);
  result.pipetteChargesMulti16 = mc16 * (sl ? sl.chargeMultiChannel16 : 0);
  result.pipetteChargesTotal =
    result.pipetteChargesSingle +
    result.pipetteChargesMulti8 +
    result.pipetteChargesMulti12 +
    result.pipetteChargesMulti16;

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

  // --- Subtotal before premiums/discounts ---
  let subtotal = result.pipetteChargesTotal + result.travelCharge + result.accommodationCharge;

  // --- London premium (applied to pipette charges only) ---
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
  result.costPipettesSingle = sc * settings.costSingleChannel;
  result.costPipettesMulti8 = mc8 * settings.costMultiChannel8;
  result.costPipettesMulti12 = mc12 * settings.costMultiChannel12;
  result.costPipettesMulti16 = mc16 * settings.costMultiChannel16;
  result.costPipettesTotal =
    result.costPipettesSingle +
    result.costPipettesMulti8 +
    result.costPipettesMulti12 +
    result.costPipettesMulti16;

  result.costTravel = roundTripMiles * (settings.mileageRatePence / 100);
  result.costAccommodation = totalHotelCost;
  result.costLabourCalibration = (calMinutes / 60) * settings.labourRatePerHour;
  result.costLabourTravel = (travelMinutes / 60) * settings.labourRatePerHour;
  result.travelDayBeforeNote = !!input.travelDayBefore;

  result.totalInternalCost =
    result.costPipettesTotal +
    result.costTravel +
    result.costAccommodation +
    result.costLabourCalibration +
    result.costLabourTravel;

  // --- Profit ---
  result.profitAmount = result.totalQuotePrice - result.totalInternalCost;
  result.profitMarginPercent = result.totalQuotePrice > 0
    ? (result.profitAmount / result.totalQuotePrice) * 100
    : 0;

  // --- Notes (pass through for display/print) ---
  result.notes = input.notes || '';

  return result;
}
