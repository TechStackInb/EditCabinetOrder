// ── CoInfo defaults ───────────────────────────────────────────────────────────
export const CO_INFO = {
  BoreDefault: 3,
  BoreDefaultFrac: '',
  DrawerDefaultGrain: 'Horizontal',
  DoorDefaultGrain: 'Vertical',
  BoreOffset: 3,
  ValanceDefaultGrain: 'Horizontal',
  FillerDefaultGrain: 'Horizontal',
};

// ── CalcFrac — converts fraction string to decimal ────────────────────────────
export const calcFrac = (num1) => {
  if (!num1 || num1 === '--') return 0;
  const slashIndex = num1.indexOf('/');
  if (slashIndex === -1) return 0;
  const numerator = num1.substring(0, slashIndex);
  const denominator = num1.substring(slashIndex + 1);
  if (!numerator || !denominator) return 0;
  return parseFloat(numerator) / parseFloat(denominator);
};

// ── CalcDec — converts decimal remainder to fraction string ───────────────────
export const calcDec = (num1) => {
  if (num1 === null || num1 === undefined) return '--';
  const n = parseFloat(num1);
  if (isNaN(n)) return '--';
  if (n >= 0 && n <= 0.0624) return '--';
  if (n >= 0.0625 && n <= 0.1249) return '1/16';
  if (n >= 0.125 && n <= 0.1874) return '1/8';
  if (n >= 0.1875 && n <= 0.2499) return '3/16';
  if (n >= 0.25 && n <= 0.3124) return '1/4';
  if (n >= 0.3125 && n <= 0.3749) return '5/16';
  if (n >= 0.375 && n <= 0.4374) return '3/8';
  if (n >= 0.4375 && n <= 0.4999) return '7/16';
  if (n >= 0.5 && n <= 0.5624) return '1/2';
  if (n >= 0.5625 && n <= 0.6249) return '9/16';
  if (n >= 0.625 && n <= 0.6874) return '5/8';
  if (n >= 0.6875 && n <= 0.7499) return '11/16';
  if (n >= 0.75 && n <= 0.8124) return '3/4';
  if (n >= 0.8125 && n <= 0.8749) return '13/16';
  if (n >= 0.875 && n <= 0.9374) return '7/8';
  if (n >= 0.9375 && n <= 0.9999) return '15/16';
  return '--';
};

// ── Size limits (from CabTblDoorMinMax) ───────────────────────────────────────
export const SIZE_LIMITS = {
  SRH: 4, // Short Routed Height Min (absolute min for routed types)
  FRH: 6, // Full Routed Height Min (below = SmallRail)
  FSH: 3.5, // Full Solid Height Min (drawer front)
  FXH: 94, // Max Height (all types)
  SRW: 6, // Short Routed Width Min
  FSW: 5.5, // Full Solid Width Min (drawer front)
  FXW: 54, // Max Width (routed/drawer)
  MVH: 5, // Valance Height Min
  FVH: 46, // Valance Height Max
  MVW: 36, // Valance Width Min
  FVW: 94, // Valance Width Max
  DAH: 2, // Default Arch Height whole
  DAHF: '3/4', // Default Arch Height fraction
  MFW: 0.75, // Filler Width Min (MFW=0 + MFWF=3/4)
  FFW: 54, // Filler Width Max
  MFH: 0.75, // Filler Height Min (MFH=0 + MFHF=3/4)
  FFH: 94, // Filler Height Max
  OVERSIZED_HEIGHT: 54, // Oversized threshold for height
  OVERSIZED_WIDTH: 55, // Oversized threshold for width
};

// ── Helper: format decimal size for display messages ─────────────────────────
export const formatSize = (decimal) => {
  const whole = Math.floor(decimal);
  const remainder = decimal - whole;
  const frac = calcDec(remainder);
  if (frac === '--') return `${whole}"`;
  return `${whole} ${frac}"`;
};

// ── Bore options per cabinet type (RefreshBoreList) ───────────────────────────
export const getBoreOptions = (cabinetType) => {
  switch (cabinetType) {
    case 'Base':
    case 'Upper':
      return [
        { label: 'Left', value: 'Left' },
        { label: 'Right', value: 'Right' },
        { label: 'None', value: 'None' },
      ];
    case 'Lazy Susan':
      return [
        { label: 'L + R LH', value: 'L + R LH' },
        { label: 'L + R RH', value: 'L + R RH' },
        { label: 'None LH', value: 'None LH' },
        { label: 'None RH', value: 'None RH' },
      ];
    default:
      return [{ label: 'None', value: 'None' }];
  }
};

// ── Cabinet types where customBore/smallRail are not available ────────────────
export const NO_BORE_TYPES = ['Drawer Front', 'Valance', 'Filler'];
export const NO_SMALL_RAIL_TYPES = ['Drawer Front', 'Valance', 'Filler'];

// ── Apply bore defaults (Bore_AfterUpdate) ────────────────────────────────────
export const applyBoreDefaults = (bore, heightInches, heightFraction) => {
  const updates = { bore };
  const h = parseFloat(heightInches || 0) + calcFrac(heightFraction);

  switch (bore) {
    case 'Right':
    case 'Left':
    case 'L + R':
    case 'L + R RH':
    case 'L + R LH':
      updates.boreTop = String(CO_INFO.BoreDefault);
      updates.boreTopFrac = CO_INFO.BoreDefaultFrac;
      updates.boreBottom = String(CO_INFO.BoreDefault);
      updates.boreBottomFrac = CO_INFO.BoreDefaultFrac;
      updates.boreMid = '';
      updates.boreMidFrac = '';
      break;
    case 'None':
    case 'None LH':
    case 'None RH':
    default:
      updates.boreTop = '';
      updates.boreTopFrac = '';
      updates.boreBottom = '';
      updates.boreBottomFrac = '';
      updates.boreMid = '';
      updates.boreMidFrac = '';
      break;
  }

  // Flag if height >= 36 so UI can prompt for center bore
  updates.promptCenterBore =
    bore !== 'None' && bore !== 'None LH' && bore !== 'None RH' && h >= 36;

  return updates;
};

// ── Calculate center bore mid position ───────────────────────────────────────
export const calcCenterBore = (heightInches, heightFraction) => {
  const h = parseFloat(heightInches || 0) + calcFrac(heightFraction);
  const a = h / 2;
  const frac = calcDec(a - Math.floor(a));
  return {
    boreMid: String(Math.floor(a)),
    // Normalize '--' to '' so it matches the Select option's empty value
    boreMidFrac: frac === '--' ? '' : frac,
  };
};

// ── Bore Top validation (CTop_AfterUpdate) ────────────────────────────────────
// Only validates when bore is active (not None) and value > 0
// Must be >= 1 and <= (height - 2)
export const validateBoreTop = (
  boreTop,
  boreTopFrac,
  heightInches,
  heightFraction,
  bore
) => {
  const top = parseFloat(boreTop || 0) + calcFrac(boreTopFrac);
  const h = parseFloat(heightInches || 0) + calcFrac(heightFraction);

  // Skip validation when bore is None or value is 0
  if (
    !bore ||
    bore === 'None' ||
    bore === 'None LH' ||
    bore === 'None RH' ||
    top === 0
  )
    return { valid: true };

  if (top < 1 || top > h - 2) {
    return {
      valid: false,
      message: 'Invalid top bore placement.',
      correctedValue: String(CO_INFO.BoreDefault),
      correctedFrac: CO_INFO.BoreDefaultFrac,
    };
  }
  return { valid: true };
};

// ── Bore Bottom validation (CBot_AfterUpdate) ────────────────────────────────
// Only validates when bore is active (not None) and value > 0
// Must be >= 1 and <= (height - 2)
export const validateBoreBottom = (
  boreBottom,
  boreBottomFrac,
  heightInches,
  heightFraction,
  bore
) => {
  const bot = parseFloat(boreBottom || 0) + calcFrac(boreBottomFrac);
  const h = parseFloat(heightInches || 0) + calcFrac(heightFraction);

  // Skip validation when bore is None or value is 0
  if (
    !bore ||
    bore === 'None' ||
    bore === 'None LH' ||
    bore === 'None RH' ||
    bot === 0
  )
    return { valid: true };

  if (bot < 1 || bot > h - 2) {
    return {
      valid: false,
      message: 'Invalid bottom bore placement.',
      correctedValue: String(CO_INFO.BoreDefault),
      correctedFrac: CO_INFO.BoreDefaultFrac,
    };
  }
  return { valid: true };
};

// ── Bore Mid validation (CMid_AfterUpdate) ────────────────────────────────────
// Must be >= 2 and <= (height - 4), or 0 (no mid bore)
// Also auto-sets customBore based on whether mid > 0
export const validateBoreMid = (
  boreMid,
  boreMidFrac,
  heightInches,
  heightFraction
) => {
  const mid = parseFloat(boreMid || 0) + calcFrac(boreMidFrac);
  const h = parseFloat(heightInches || 0) + calcFrac(heightFraction);

  // 0 or empty means no mid bore — always valid
  if (!boreMid || mid === 0) return { valid: true, customBore: false };

  if (mid < 2 || mid > h - 4) {
    return {
      valid: false,
      message: 'Invalid middle bore placement.',
      correctedValue: '',
      correctedFrac: '',
      customBore: false,
    };
  }

  return { valid: true, customBore: true };
};

// ── Style (Door Type) defaults (Style_AfterUpdate) ────────────────────────────
// Only relevant for Valance — when Arch selected, set default arch height
// When not Arch, reset arch height to 0
export const applyStyleDefaults = (doorType) => {
  if (doorType === 'Arch') {
    return {
      doorType,
      archHeightInches: String(SIZE_LIMITS.DAH),
      archHeightFraction: SIZE_LIMITS.DAHF,
      archError: null,
    };
  }
  return {
    doorType,
    archHeightInches: '',
    archHeightFraction: '',
    archError: null,
  };
};

// ── Arch height validation (ATop_AfterUpdate) — Valance only ─────────────────
// Min arch = 2.75"
// Max arch = door height - 2.25", only validated when door height >= MVH (5")
export const validateArchHeight = (
  archInches,
  archFraction,
  heightInches,
  heightFraction
) => {
  const arch = parseFloat(archInches || 0) + calcFrac(archFraction);
  const h = parseFloat(heightInches || 0) + calcFrac(heightFraction);

  if (arch === 0) return { valid: true };

  const MIN_ARCH = SIZE_LIMITS.DAH + calcFrac(SIZE_LIMITS.DAHF); // 2.75"

  if (arch < MIN_ARCH) {
    return {
      valid: false,
      message: `Minimum height of arch is ${formatSize(MIN_ARCH)}.`,
      correctedHeight: String(SIZE_LIMITS.DAH),
      correctedFraction: SIZE_LIMITS.DAHF,
    };
  }

  // VBA: only validate max arch when door height >= MVH (5"), the min Valance height.
  // Below that, the door height itself is invalid, so don't double-fail on arch.
  if (h >= SIZE_LIMITS.MVH && arch + 2.25 > h) {
    const maxArch = h - 2.25;
    return {
      valid: false,
      message: `Arch height exceeds maximum allowable. Maximum arch height is ${formatSize(maxArch)}.`,
      correctedHeight: String(SIZE_LIMITS.DAH),
      correctedFraction: SIZE_LIMITS.DAHF,
    };
  }

  return { valid: true };
};

// ── Width validation (Wdth_AfterUpdate) ──────────────────────────────────────
export const validateWidth = (
  cabinetType,
  widthInches,
  widthFraction,
  heightInches,
  heightFraction
) => {
  const w = parseFloat(widthInches || 0) + calcFrac(widthFraction);
  const h = parseFloat(heightInches || 0) + calcFrac(heightFraction);

  if (!widthInches || w === 0) {
    return { valid: true, oversized: false, message: null };
  }

  const oversized =
    w > SIZE_LIMITS.OVERSIZED_WIDTH || h > SIZE_LIMITS.OVERSIZED_HEIGHT;
  let result = {
    valid: true,
    oversized,
    message: null,
    correctedWidth: null,
    correctedFraction: null,
  };

  switch (cabinetType) {
    case 'Drawer Front': {
      const min = SIZE_LIMITS.FSW; // 5.5"
      const max = SIZE_LIMITS.FXW; // 54"
      if (w < min) {
        result = {
          ...result,
          valid: false,
          message: `Minimum width is ${formatSize(min)}.`,
          correctedWidth: String(Math.floor(min)),
          correctedFraction: calcDec(min - Math.floor(min)),
        };
      } else if (w > max) {
        result = {
          ...result,
          valid: false,
          message: `Maximum width is ${formatSize(max)}.`,
          correctedWidth: String(Math.floor(max)),
          correctedFraction: '',
        };
      }
      break;
    }
    case 'Routed Drawer':
    case 'Base':
    case 'Upper':
    case 'Lazy Susan': {
      const min = SIZE_LIMITS.SRW; // 6"
      const max = SIZE_LIMITS.FXW; // 54"
      if (w < min) {
        result = {
          ...result,
          valid: false,
          message: `Minimum width is ${formatSize(min)}.`,
          correctedWidth: String(Math.floor(min)),
          correctedFraction: '',
        };
      } else if (w > max) {
        result = {
          ...result,
          valid: false,
          message: `Maximum width is ${formatSize(max)}.`,
          correctedWidth: String(Math.floor(max)),
          correctedFraction: '',
        };
      }
      break;
    }
    case 'Filler': {
      const min = SIZE_LIMITS.MFW; // 0.75" (MFW=0 + MFWF=3/4)
      const max = SIZE_LIMITS.FFW; // 54"
      if (w < min) {
        result = {
          ...result,
          valid: false,
          message: `Minimum width is ${formatSize(min)}.`,
          correctedWidth: '0',
          correctedFraction: '3/4',
        };
      } else if (w > max) {
        result = {
          ...result,
          valid: false,
          message: `Maximum width is ${formatSize(max)}.`,
          correctedWidth: String(Math.floor(max)),
          correctedFraction: '',
        };
      }
      break;
    }
    case 'Valance': {
      const min = SIZE_LIMITS.MVW; // 36"
      const max = SIZE_LIMITS.FVW; // 94"
      if (w < min) {
        result = {
          ...result,
          valid: false,
          message: `Minimum width is ${formatSize(min)}.`,
          correctedWidth: String(Math.floor(min)),
          correctedFraction: '',
        };
      } else if (w > max) {
        result = {
          ...result,
          valid: false,
          message: `Maximum width is ${formatSize(max)}.`,
          correctedWidth: String(Math.floor(max)),
          correctedFraction: '',
        };
      }
      break;
    }
    default:
      break;
  }

  return { ...result, oversized };
};

// ── Height validation (Hght_AfterUpdate) ─────────────────────────────────────
export const validateHeight = (
  cabinetType,
  heightInches,
  heightFraction,
  widthInches,
  widthFraction
) => {
  const h = parseFloat(heightInches || 0) + calcFrac(heightFraction);
  const w = parseFloat(widthInches || 0) + calcFrac(widthFraction);

  if (!heightInches || h === 0) {
    return { valid: true, smallRail: false, oversized: false, message: null };
  }

  const oversized =
    w > SIZE_LIMITS.OVERSIZED_WIDTH || h > SIZE_LIMITS.OVERSIZED_HEIGHT;
  let result = {
    valid: true,
    smallRail: false,
    oversized,
    message: null,
    correctedHeight: null,
    correctedFraction: null,
  };

  switch (cabinetType) {
    case 'Drawer Front': {
      const min = SIZE_LIMITS.FSH; // 3.5"
      const max = SIZE_LIMITS.FXH; // 94"
      if (h < min) {
        result = {
          ...result,
          valid: false,
          message: `Minimum height is ${formatSize(min)}.`,
          correctedHeight: String(Math.floor(min)),
          correctedFraction: calcDec(min - Math.floor(min)),
        };
      } else if (h > max) {
        result = {
          ...result,
          valid: false,
          message: `Maximum height is ${formatSize(max)}.`,
          correctedHeight: String(Math.floor(max)),
          correctedFraction: '',
        };
      }
      break;
    }
    case 'Routed Drawer':
    case 'Base':
    case 'Upper':
    case 'Lazy Susan': {
      const srh = SIZE_LIMITS.SRH; // 4"
      const frh = SIZE_LIMITS.FRH; // 6"
      const max = SIZE_LIMITS.FXH; // 94"
      if (h < srh) {
        result = {
          ...result,
          valid: false,
          smallRail: true,
          message: `Minimum height is ${formatSize(srh)}. Rails will be made half size.`,
          correctedHeight: String(Math.floor(srh)),
          correctedFraction: calcDec(srh - Math.floor(srh)),
        };
      } else if (h < frh) {
        result = {
          ...result,
          valid: true,
          smallRail: true,
          message: `Minimum height for full size door is ${formatSize(frh)}. Rails will be made half size.`,
        };
      } else if (h > max) {
        result = {
          ...result,
          valid: false,
          message: `Maximum height is ${formatSize(max)}.`,
          correctedHeight: String(Math.floor(max)),
          correctedFraction: '',
        };
      }
      break;
    }
    case 'Filler': {
      const min = SIZE_LIMITS.MFH; // 0.75" (MFH=0 + MFHF=3/4)
      const max = SIZE_LIMITS.FFH; // 94"
      if (h < min) {
        result = {
          ...result,
          valid: false,
          message: `Minimum height for filler is ${formatSize(min)}.`,
          correctedHeight: '0',
          correctedFraction: '3/4',
        };
      } else if (h > max) {
        result = {
          ...result,
          valid: false,
          message: `Maximum height is ${formatSize(max)}.`,
          correctedHeight: String(Math.floor(max)),
          correctedFraction: '',
        };
      }
      break;
    }
    case 'Valance': {
      const min = SIZE_LIMITS.MVH; // 5"
      const max = SIZE_LIMITS.FVH; // 46"
      if (h < min) {
        result = {
          ...result,
          valid: false,
          message: `Minimum height is ${formatSize(min)}.`,
          correctedHeight: String(Math.floor(min)),
          correctedFraction: '',
        };
      } else if (h > max) {
        result = {
          ...result,
          valid: false,
          message: `Maximum height is ${formatSize(max)}.`,
          correctedHeight: String(Math.floor(max)),
          correctedFraction: '',
        };
      }
      break;
    }
    default:
      break;
  }

  return { ...result, oversized };
};
