// ============================================================
// quote.js — Pure calculation engine, no DOM access
// ============================================================

function calculateQuote(input, settings) {
  const result = {};

  // --- Pipette counts ---
  const sc = input.singleChannelCount || 0;
  const mc8 = input.multiChannel8Count || 0;
  const mc12 = input.multiChannel12Count || 0;
  const mc16 = input.multiChannel16Count || 0;
  result.totalPipettes = sc + mc8 + mc12 + mc16;
  result.totalChannels = sc + (mc8 * 8) + (mc12 * 12) + (mc16 * 16);

  // --- Revenue: Pipette charges ---
  result.pipetteChargesSingle = sc * settings.chargeSingleChannel;
  result.pipetteChargesMulti8 = mc8 * settings.chargeMultiChannel8;
  result.pipetteChargesMulti12 = mc12 * settings.chargeMultiChannel12;
  result.pipetteChargesMulti16 = mc16 * settings.chargeMultiChannel16;
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
  const hotelCost = input.overnightStay
    ? (input.hotelCost || settings.hotelBudgetDefault)
    : 0;
  const nights = input.overnightStay ? (input.nights || 1) : 0;
  const totalHotelCost = hotelCost * nights;

  if (input.overnightStay && settings.chargeAccommodationToCustomer) {
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

  // --- Express premium ---
  if (input.serviceLevel === 'express') {
    result.expressPremium = result.pipetteChargesTotal * (settings.expressPremiumPercent / 100);
  } else {
    result.expressPremium = 0;
  }

  result.subtotalBeforeDiscount = subtotal + result.londonPremium + result.expressPremium;

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

  // Mileage cost (round trip, internal)
  result.costTravel = roundTripMiles * (settings.mileageRatePence / 100);

  // Accommodation cost (internal — always a cost even if not charged to customer)
  result.costAccommodation = totalHotelCost;
  result.nights = nights;

  // Labour cost: calibration time
  const calMinutes = input.calibrationTimeMinutes || 0;
  result.costLabourCalibration = (calMinutes / 60) * settings.labourRatePerHour;

  // Labour cost: travel time
  const travelMinutes = input.travelTimeMinutes || 0;
  result.costLabourTravel = (travelMinutes / 60) * settings.labourRatePerHour;

  // If travelling day before, add extra labour for that travel time
  if (input.travelDayBefore) {
    // Travel time is already counted — but we note this for the summary
    result.travelDayBeforeNote = true;
  } else {
    result.travelDayBeforeNote = false;
  }

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

  // --- Auto-estimated calibration time ---
  result.estimatedCalMinutes =
    (sc * settings.minutesPerSingleChannel) +
    ((mc8 + mc12 + mc16) * settings.minutesPerMultiChannel);

  return result;
}
