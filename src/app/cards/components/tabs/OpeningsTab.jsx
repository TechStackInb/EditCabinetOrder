import { useState, useEffect } from 'react';
import {
  Flex,
  Box,
  Text,
  Input,
  Select,
  Checkbox,
  Button,
  Divider,
  Tag,
  Alert,
  TextArea,
} from '@hubspot/ui-extensions';

import {
  CO_INFO,
  getBoreOptions,
  validateHeight,
  validateWidth,
  validateArchHeight,
  validateBoreTop,
  validateBoreBottom,
  validateBoreMid,
  applyBoreDefaults,
  applyStyleDefaults,
  calcCenterBore,
  NO_BORE_TYPES,
  NO_SMALL_RAIL_TYPES,
} from './cabinetOpeningUtils';

// ── Constants ─────────────────────────────────────────────────────────────────

const CABINET_TYPES = [
  { label: 'Select...', value: '' },
  { label: 'Base', value: 'Base' },
  { label: 'Upper', value: 'Upper' },
  { label: 'Lazy Susan', value: 'Lazy Susan' },
  { label: 'Drawer Front', value: 'Drawer Front' },
  { label: 'Routed Drawer', value: 'Routed Drawer' },
  { label: 'Filler', value: 'Filler' },
  { label: 'Valance', value: 'Valance' },
];

const DOOR_TYPES_ALL = [
  { label: 'Select...', value: '' },
  { label: 'Solid', value: 'Solid' },
];

const DOOR_TYPES_SOLID_ONLY = [{ label: 'Solid', value: 'Solid' }];

const DOOR_TYPES_VALANCE = [
  { label: 'Arch', value: 'Arch' },
  { label: 'Flat', value: 'Flat' },
];

const GRAIN_OPTIONS = [
  { label: 'Vertical', value: 'Vertical' },
  { label: 'Horizontal', value: 'Horizontal' },
];

const FRACTIONS = [
  { label: '--', value: '' },
  { label: '1/16', value: '1/16' },
  { label: '1/8', value: '1/8' },
  { label: '3/16', value: '3/16' },
  { label: '1/4', value: '1/4' },
  { label: '5/16', value: '5/16' },
  { label: '3/8', value: '3/8' },
  { label: '7/16', value: '7/16' },
  { label: '1/2', value: '1/2' },
  { label: '9/16', value: '9/16' },
  { label: '5/8', value: '5/8' },
  { label: '11/16', value: '11/16' },
  { label: '3/4', value: '3/4' },
  { label: '13/16', value: '13/16' },
  { label: '7/8', value: '7/8' },
  { label: '15/16', value: '15/16' },
];

const BORE_POSITION = [
  { label: '--', value: '' },
  { label: '1/16', value: '1/16' },
  { label: '1/8', value: '1/8' },
  { label: '3/16', value: '3/16' },
  { label: '1/4', value: '1/4' },
  { label: '5/16', value: '5/16' },
  { label: '3/8', value: '3/8' },
  { label: '7/16', value: '7/16' },
  { label: '1/2', value: '1/2' },
  { label: '9/16', value: '9/16' },
  { label: '5/8', value: '5/8' },
  { label: '11/16', value: '11/16' },
  { label: '3/4', value: '3/4' },
  { label: '13/16', value: '13/16' },
  { label: '7/8', value: '7/8' },
  { label: '15/16', value: '15/16' },
];

const FILLER_MATERIALS = [
  { label: '1/4 MDF', value: '1/4 MDF' },
  { label: '3/4 MDF', value: '3/4 MDF' },
];

// ── Numeric only filter ───────────────────────────────────────────────────────
const numericOnly = (value) => value.replace(/[^0-9.]/g, '');

// ── Helpers ───────────────────────────────────────────────────────────────────

let _nextId = 1;

const createEmptyRow = () => {
  const id = _nextId++;
  return {
    id,
    cabinetType: '',
    doorType: '',
    widthInches: '',
    widthFraction: '',
    heightInches: '',
    heightFraction: '',
    grain: CO_INFO.DoorDefaultGrain,
    bore: 'None',
    boreTop: '',
    boreTopFrac: '',
    boreMid: '',
    boreMidFrac: '',
    boreBottom: '',
    boreBottomFrac: '',
    boreOffset: String(CO_INFO.BoreOffset),
    midBore: false,
    smallRail: false,
    oversized: false,
    customBore: false,
    ordered: false,
    archHeightInches: '',
    archHeightFraction: '',
    fillerMaterial: '',
    notes: '', // optional per-opening note
    heightError: null,
    widthError: null,
    archError: null,
    boreTopError: null,
    boreMidError: null,
    boreBottomError: null,
    promptCenterBore: false,
    promptSmallRail: false,
    _lazySusanCompanionOf: null,
  };
};

const isRowValid = (row) =>
  Boolean(
    row.cabinetType &&
    row.doorType &&
    row.widthInches &&
    row.heightInches &&
    !row.heightError &&
    !row.widthError &&
    !row.boreTopError &&
    !row.boreMidError &&
    !row.boreBottomError &&
    !row.archError,
  );

// A row counts as "started" when the user has picked a cabinet type.
// Started rows must be completed before Next/Submit is allowed.
const isRowStarted = (row) => Boolean(row.cabinetType);

const getDoorTypeOptions = (cabinetType) => {
  switch (cabinetType) {
    case 'Valance':
      return DOOR_TYPES_VALANCE;
    case 'Base':
    case 'Upper':
    case 'Lazy Susan':
    case 'Drawer Front':
    case 'Routed Drawer':
    case 'Filler':
      return DOOR_TYPES_SOLID_ONLY;
    default:
      return DOOR_TYPES_ALL;
  }
};

// ── Apply cabinet type defaults ───────────────────────────────────────────────
const applyTypeDefaults = (row, cabinetType) => {
  const updated = {
    ...row,
    cabinetType,
    heightError: null,
    widthError: null,
    archError: null,
    boreTopError: null,
    boreMidError: null,
    boreBottomError: null,
    promptCenterBore: false,
  };

  switch (cabinetType) {
    case 'Drawer Front':
    case 'Routed Drawer':
      updated.grain = CO_INFO.DrawerDefaultGrain;
      updated.bore = 'None';
      updated.doorType = 'Solid';
      updated.boreTop = '';
      updated.boreTopFrac = '';
      updated.boreBottom = '';
      updated.boreBottomFrac = '';
      updated.boreMid = '';
      updated.boreMidFrac = '';
      updated.customBore = false;
      break;

    case 'Base':
    case 'Upper':
      // VBA Type_AfterUpdate for Base/Upper does NOT auto-set Bore — user picks it.
      // Default to None so user can explicitly pick Left/Right and trigger Bore_AfterUpdate logic.
      updated.grain = CO_INFO.DoorDefaultGrain;
      updated.bore = 'None';
      updated.doorType = 'Solid';
      updated.boreTop = '';
      updated.boreTopFrac = '';
      updated.boreBottom = '';
      updated.boreBottomFrac = '';
      updated.boreMid = '';
      updated.boreMidFrac = '';
      break;

    case 'Lazy Susan':
      updated.grain = CO_INFO.DoorDefaultGrain;
      updated.bore = 'L + R RH';
      updated.doorType = 'Solid';
      updated.boreTop = String(CO_INFO.BoreDefault);
      updated.boreTopFrac = CO_INFO.BoreDefaultFrac;
      updated.boreBottom = String(CO_INFO.BoreDefault);
      updated.boreBottomFrac = CO_INFO.BoreDefaultFrac;
      updated.boreMid = '';
      updated.boreMidFrac = '';
      break;

    case 'Valance':
      updated.grain = CO_INFO.ValanceDefaultGrain;
      updated.bore = 'None';
      updated.doorType = 'Flat';
      updated.widthInches = '';
      updated.widthFraction = '';
      updated.heightInches = '';
      updated.heightFraction = '';
      updated.boreTop = '';
      updated.boreTopFrac = '';
      updated.boreBottom = '';
      updated.boreBottomFrac = '';
      updated.boreMid = '';
      updated.boreMidFrac = '';
      updated.customBore = false;
      updated.archHeightInches = '';
      updated.archHeightFraction = '';
      break;

    case 'Filler':
      updated.grain = CO_INFO.FillerDefaultGrain;
      updated.bore = 'None';
      updated.doorType = 'Solid';
      updated.boreTop = '';
      updated.boreTopFrac = '';
      updated.boreBottom = '';
      updated.boreBottomFrac = '';
      updated.boreMid = '';
      updated.boreMidFrac = '';
      updated.customBore = false;
      updated.fillerMaterial = '3/4 MDF';
      break;

    default:
      break;
  }

  return updated;
};

// ── Single Opening Card ───────────────────────────────────────────────────────

const OpeningCard = ({
  row,
  index,
  total,
  updateRow,
  deleteRow,
  duplicateRow,
  applyBoreOffsetToAll,
  applyGrainToSimilar,
}) => {
  const valid = isRowValid(row);
  const boreOptions = getBoreOptions(row.cabinetType);
  const doorTypeOptions = getDoorTypeOptions(row.cabinetType);
  const boreLocked =
    boreOptions.length === 1 && boreOptions[0].value === 'None';
  const doorTypeLocked = doorTypeOptions.length === 1;
  const noBoreAvailable = NO_BORE_TYPES.includes(row.cabinetType);
  const noSmallRail = NO_SMALL_RAIL_TYPES.includes(row.cabinetType);
  const isValance = row.cabinetType === 'Valance';
  const isFiller = row.cabinetType === 'Filler';

  const set = (field, value) => updateRow(row.id, field, value);

  const handleCabinetTypeChange = (v) => {
    updateRow(row.id, '__applyTypeDefaults', v);
  };

  const handleDoorTypeChange = (v) => {
    if (isValance) {
      const updates = applyStyleDefaults(v);
      updateRow(row.id, '__batch', updates);
    } else {
      set('doorType', v);
    }
  };

  const handleBoreChange = (v) => {
    const updates = applyBoreDefaults(v, row.heightInches, row.heightFraction);
    updates.boreTopError = null;
    updates.boreBottomError = null;
    updates.boreMidError = null;
    updateRow(row.id, '__batch', updates);
  };

  const handleCenterBoreYes = () => {
    const { boreMid, boreMidFrac } = calcCenterBore(
      row.heightInches,
      row.heightFraction,
    );
    updateRow(row.id, '__batch', {
      boreMid,
      boreMidFrac,
      midBore: true,
      customBore: true,
      promptCenterBore: false,
    });
  };

  const handleCenterBoreNo = () => {
    updateRow(row.id, '__batch', {
      boreMid: '',
      boreMidFrac: '',
      midBore: false,
      customBore: false,
      promptCenterBore: false,
    });
  };

  const handleWidthChange = (field, value) => {
    const widthInches = field === 'widthInches' ? value : row.widthInches;
    const widthFraction = field === 'widthFraction' ? value : row.widthFraction;
    const result = validateWidth(
      row.cabinetType,
      widthInches,
      widthFraction,
      row.heightInches,
      row.heightFraction,
    );
    // Show warning only — do NOT auto-correct mid-typing (user fixes it themselves)
    const updates = {
      [field]: value,
      oversized: result.oversized,
      widthError: result.message ?? null,
    };
    updateRow(row.id, '__batch', updates);
  };

  const handleHeightChange = (field, value) => {
    const heightInches = field === 'heightInches' ? value : row.heightInches;
    const heightFraction =
      field === 'heightFraction' ? value : row.heightFraction;
    const result = validateHeight(
      row.cabinetType,
      heightInches,
      heightFraction,
      row.widthInches,
      row.widthFraction,
    );
    // Show warning only — do NOT auto-correct mid-typing
    const updates = {
      [field]: value,
      smallRail: result.smallRail,
      oversized: result.oversized,
      heightError: result.message ?? null,
    };

    // VBA: when height changes for Valance + Arch, re-validate arch (still useful — re-mark error only)
    if (row.cabinetType === 'Valance' && row.doorType === 'Arch') {
      const archResult = validateArchHeight(
        row.archHeightInches,
        row.archHeightFraction,
        heightInches,
        heightFraction,
      );
      updates.archError = archResult.valid ? null : archResult.message;
    }

    updateRow(row.id, '__batch', updates);
  };

  const handleBoreTopChange = (field, value) => {
    const boreTop = field === 'boreTop' ? value : row.boreTop;
    const boreTopFrac = field === 'boreTopFrac' ? value : row.boreTopFrac;
    const result = validateBoreTop(
      boreTop,
      boreTopFrac,
      row.heightInches,
      row.heightFraction,
      row.bore,
    );
    // Show warning only — do NOT auto-correct mid-typing
    const updates = {
      [field]: value,
      boreTopError: result.valid ? null : result.message,
    };
    updateRow(row.id, '__batch', updates);
  };

  const handleBoreBottomChange = (field, value) => {
    const boreBottom = field === 'boreBottom' ? value : row.boreBottom;
    const boreBottomFrac =
      field === 'boreBottomFrac' ? value : row.boreBottomFrac;
    const result = validateBoreBottom(
      boreBottom,
      boreBottomFrac,
      row.heightInches,
      row.heightFraction,
      row.bore,
    );
    // Show warning only — do NOT auto-correct mid-typing
    const updates = {
      [field]: value,
      boreBottomError: result.valid ? null : result.message,
    };
    updateRow(row.id, '__batch', updates);
  };

  const handleBoreMidChange = (field, value) => {
    // HubSpot Input's `disabled` prop doesn't actually block typing — enforce it here
    if (!row.midBore) return;
    const boreMid = field === 'boreMid' ? value : row.boreMid;
    const boreMidFrac = field === 'boreMidFrac' ? value : row.boreMidFrac;
    const result = validateBoreMid(
      boreMid,
      boreMidFrac,
      row.heightInches,
      row.heightFraction,
    );
    // Show warning only — do NOT auto-correct mid-typing
    const updates = {
      [field]: value,
      boreMidError: result.valid ? null : result.message,
      customBore: result.customBore,
    };
    updateRow(row.id, '__batch', updates);
  };

  const handleArchChange = (field, value) => {
    const archInches =
      field === 'archHeightInches' ? value : row.archHeightInches;
    const archFraction =
      field === 'archHeightFraction' ? value : row.archHeightFraction;
    const result = validateArchHeight(
      archInches,
      archFraction,
      row.heightInches,
      row.heightFraction,
    );
    // Show warning only — do NOT auto-correct mid-typing
    const updates = {
      [field]: value,
      archError: result.valid ? null : result.message,
    };
    updateRow(row.id, '__batch', updates);
  };

  // VBA SmallRail_AfterUpdate:
  //   - For Drawer Front/Valance/Filler: not available (handled by disabled checkbox)
  //   - When user CHECKS it: confirm "This will force this opening to have 1/2 size rails."
  //   - When system sets it (via height validation), no prompt needed — only when user clicks
  //   - When user unchecks it: just turn off, no confirm
  const handleSmallRailChange = (v) => {
    if (noSmallRail) return;
    if (v) {
      // user is turning ON — show confirmation
      updateRow(row.id, '__batch', { promptSmallRail: true });
    } else {
      // user is turning OFF — just set false
      set('smallRail', false);
    }
  };

  const handleSmallRailYes = () => {
    updateRow(row.id, '__batch', { smallRail: true, promptSmallRail: false });
  };

  const handleSmallRailNo = () => {
    updateRow(row.id, '__batch', { smallRail: false, promptSmallRail: false });
  };

  const handleCustomBoreChange = (v) => {
    if (noBoreAvailable) return;
    set('customBore', v);
  };

  const handleMidBoreChange = (v) => {
    if (noBoreAvailable) return;
    if (v) {
      const { boreMid, boreMidFrac } = calcCenterBore(
        row.heightInches,
        row.heightFraction,
      );
      updateRow(row.id, '__batch', {
        midBore: true,
        customBore: true,
        boreMid,
        boreMidFrac,
      });
    } else {
      updateRow(row.id, '__batch', {
        midBore: false,
        customBore: false,
        boreMid: '',
        boreMidFrac: '',
      });
    }
  };

  return (
    <Box>
      <Flex direction="column" gap="medium">
        {/* ── Card Header ── */}
        <Flex direction="row" justify="between" align="center">
          <Flex direction="row" gap="small" align="center">
            <Tag variant={valid ? 'success' : 'error'}>D{index + 1}</Tag>
            <Text format={{ fontWeight: 'bold' }}>
              {row.cabinetType
                ? `${row.cabinetType}${row.doorType ? ' · ' + row.doorType : ''}`
                : 'New Opening'}
            </Text>
            {row._lazySusanCompanionOf && (
              <Tag variant="info">Auto-created (Lazy Susan companion)</Tag>
            )}
            {row.oversized && <Tag variant="warning">Oversized</Tag>}
            {row.smallRail && <Tag variant="warning">Small Rail</Tag>}
          </Flex>
          <Flex direction="row" gap="small">
            <Button
              variant="secondary"
              size="xs"
              onClick={() => duplicateRow(row.id)}
            >
              Duplicate
            </Button>
            <Button
              variant="destructive"
              size="xs"
              onClick={() => deleteRow(row.id)}
              disabled={total === 1}
            >
              Remove
            </Button>
          </Flex>
        </Flex>

        {/* ── Section 1: Door Details ── */}
        <Text variant="microcopy" format={{ fontWeight: 'bold' }}>
          DOOR DETAILS
        </Text>
        <Flex direction="row" gap="small">
          <Box flex={1}>
            <Select
              label="Cabinet Type *"
              name={`cabinetType-${row.id}`}
              options={CABINET_TYPES}
              value={row.cabinetType}
              onChange={handleCabinetTypeChange}
            />
          </Box>
          <Box flex={1}>
            <Select
              label="Door Type *"
              name={`doorType-${row.id}`}
              options={doorTypeOptions}
              value={row.doorType}
              onChange={handleDoorTypeChange}
              disabled={doorTypeLocked}
            />
          </Box>
          <Box flex={1}>
            <Select
              label="Grain Direction"
              name={`grain-${row.id}`}
              options={GRAIN_OPTIONS}
              value={row.grain}
              onChange={(v) => set('grain', v)}
            />
          </Box>
          <Box flex={1}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                applyGrainToSimilar(row.id, row.cabinetType, row.grain)
              }
            >
              Apply Grain To Similar
            </Button>
          </Box>
        </Flex>

        {/* ── Section 2: Dimensions ── */}
        <Text variant="microcopy" format={{ fontWeight: 'bold' }}>
          DIMENSIONS
        </Text>
        <Flex direction="row" gap="small">
          <Box flex={1}>
            <Input
              label="Width (inches) *"
              name={`widthInches-${row.id}`}
              placeholder="0"
              value={row.widthInches}
              onChange={(v) => handleWidthChange('widthInches', numericOnly(v))}
            />
          </Box>
          <Box flex={1}>
            <Select
              label="Width (fraction)"
              name={`widthFraction-${row.id}`}
              options={FRACTIONS}
              value={row.widthFraction}
              onChange={(v) => handleWidthChange('widthFraction', v)}
            />
          </Box>
          <Box flex={1}>
            <Input
              label="Height (inches) *"
              name={`heightInches-${row.id}`}
              placeholder="0"
              value={row.heightInches}
              onChange={(v) =>
                handleHeightChange('heightInches', numericOnly(v))
              }
            />
          </Box>
          <Box flex={1}>
            <Select
              label="Height (fraction)"
              name={`heightFraction-${row.id}`}
              options={FRACTIONS}
              value={row.heightFraction}
              onChange={(v) => handleHeightChange('heightFraction', v)}
            />
          </Box>
        </Flex>

        {row.widthError && (
          <Alert title="Width Warning" variant="warning">
            {row.widthError}
          </Alert>
        )}
        {row.heightError && (
          <Alert title="Height Warning" variant="warning">
            {row.heightError}
          </Alert>
        )}

        {/* ── Section 3: Bore ── */}
        <Text variant="microcopy" format={{ fontWeight: 'bold' }}>
          BORE
        </Text>
        <Flex direction="row" gap="small">
          <Box flex={1}>
            <Select
              label="Bore Type"
              name={`bore-${row.id}`}
              options={boreOptions}
              value={row.bore}
              onChange={handleBoreChange}
              disabled={boreLocked}
            />
          </Box>
          <Box flex={1}>
            <Input
              label="Bore Offset (mm)"
              name={`boreOffset-${row.id}`}
              placeholder={String(CO_INFO.BoreOffset)}
              value={row.boreOffset}
              onChange={(v) => set('boreOffset', numericOnly(v))}
            />
          </Box>
          <Box flex={1}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => applyBoreOffsetToAll(row.boreOffset)}
            >
              Apply Offset to All
            </Button>
          </Box>
        </Flex>

        {row.promptCenterBore && (
          <Alert title="Center Bore" variant="info">
            Height is 36" or over. Would you like a center bore in this door?
            <Flex direction="row" gap="small">
              <Button variant="primary" size="sm" onClick={handleCenterBoreYes}>
                Yes
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCenterBoreNo}
              >
                No
              </Button>
            </Flex>
          </Alert>
        )}

        <Flex direction="row" gap="small">
          <Box flex={1}>
            <Input
              label="Bore Top"
              name={`boreTop-${row.id}`}
              placeholder="0"
              value={row.boreTop}
              onChange={(v) => handleBoreTopChange('boreTop', numericOnly(v))}
            />
          </Box>
          <Box flex={1}>
            <Select
              label="Top (pos)"
              name={`boreTopFrac-${row.id}`}
              options={BORE_POSITION}
              value={row.boreTopFrac}
              onChange={(v) => handleBoreTopChange('boreTopFrac', v)}
            />
          </Box>
          {row.midBore && (
            <>
              <Box flex={1}>
                <Input
                  label="Bore Mid"
                  name={`boreMid-${row.id}`}
                  placeholder="0"
                  value={row.boreMid}
                  onChange={(v) =>
                    handleBoreMidChange('boreMid', numericOnly(v))
                  }
                />
              </Box>
              <Box flex={1}>
                <Select
                  label="Mid (pos)"
                  name={`boreMidFrac-${row.id}`}
                  options={BORE_POSITION}
                  value={row.boreMidFrac}
                  onChange={(v) => handleBoreMidChange('boreMidFrac', v)}
                />
              </Box>
            </>
          )}
          <Box flex={1}>
            <Input
              label="Bore Bottom"
              name={`boreBottom-${row.id}`}
              placeholder="0"
              value={row.boreBottom}
              onChange={(v) =>
                handleBoreBottomChange('boreBottom', numericOnly(v))
              }
            />
          </Box>
          <Box flex={1}>
            <Select
              label="Bottom (pos)"
              name={`boreBottomFrac-${row.id}`}
              options={BORE_POSITION}
              value={row.boreBottomFrac}
              onChange={(v) => handleBoreBottomChange('boreBottomFrac', v)}
            />
          </Box>
        </Flex>

        {row.boreTopError && (
          <Alert title="Bore Top Warning" variant="warning">
            {row.boreTopError}
          </Alert>
        )}
        {row.boreMidError && (
          <Alert title="Bore Mid Warning" variant="warning">
            {row.boreMidError}
          </Alert>
        )}
        {row.boreBottomError && (
          <Alert title="Bore Bottom Warning" variant="warning">
            {row.boreBottomError}
          </Alert>
        )}

        {/* ── Section 4: Options ── */}
        <Text variant="microcopy" format={{ fontWeight: 'bold' }}>
          OPTIONS
        </Text>
        <Flex direction="row" gap="medium">
          <Flex direction="column" gap="extra-small">
            <Text variant="microcopy">Mid Bore</Text>
            <Checkbox
              name={`midBore-${row.id}`}
              checked={row.midBore}
              onChange={handleMidBoreChange}
              disabled={noBoreAvailable}
            />
          </Flex>
          <Flex direction="column" gap="extra-small">
            <Text variant="microcopy">Small Rail</Text>
            <Checkbox
              name={`smallRail-${row.id}`}
              checked={row.smallRail}
              onChange={handleSmallRailChange}
              disabled={noSmallRail}
            />
          </Flex>
          <Flex direction="column" gap="extra-small">
            <Text variant="microcopy">Oversized</Text>
            <Checkbox
              name={`oversized-${row.id}`}
              checked={row.oversized}
              disabled={true}
            />
          </Flex>
          <Flex direction="column" gap="extra-small">
            <Text variant="microcopy">Custom Bore</Text>
            <Checkbox
              name={`customBore-${row.id}`}
              checked={row.customBore}
              onChange={handleCustomBoreChange}
              disabled={noBoreAvailable}
            />
          </Flex>
          <Flex direction="column" gap="extra-small">
            <Text variant="microcopy">Ordered</Text>
            <Checkbox
              name={`ordered-${row.id}`}
              checked={row.ordered}
              onChange={(v) => set('ordered', v)}
            />
          </Flex>
        </Flex>

        {row.promptSmallRail && (
          <Alert title="Small Rail" variant="info">
            This will force this opening to have 1/2 size rails. Do you wish to
            proceed?
            <Flex direction="row" gap="small">
              <Button variant="primary" size="sm" onClick={handleSmallRailYes}>
                Yes
              </Button>
              <Button variant="secondary" size="sm" onClick={handleSmallRailNo}>
                No
              </Button>
            </Flex>
          </Alert>
        )}

        {/* ── Section 5: Arch — Valance only ── */}
        {isValance && (
          <>
            <Text variant="microcopy" format={{ fontWeight: 'bold' }}>
              ARCH
            </Text>
            {row.doorType === 'Arch' ? (
              <>
                <Flex direction="row" gap="small">
                  <Box flex={1}>
                    <Input
                      label="Arch Height (inches)"
                      name={`archHeightInches-${row.id}`}
                      placeholder="0"
                      value={row.archHeightInches}
                      onChange={(v) =>
                        handleArchChange('archHeightInches', numericOnly(v))
                      }
                    />
                  </Box>
                  <Box flex={1}>
                    <Select
                      label="Arch Height (fraction)"
                      name={`archHeightFraction-${row.id}`}
                      options={FRACTIONS}
                      value={row.archHeightFraction}
                      onChange={(v) =>
                        handleArchChange('archHeightFraction', v)
                      }
                    />
                  </Box>
                </Flex>
                {row.archError && (
                  <Alert title="Arch Height Warning" variant="warning">
                    {row.archError}
                  </Alert>
                )}
              </>
            ) : (
              <Text variant="microcopy">
                Arch Height applies only when Door Type is Arch.
              </Text>
            )}
          </>
        )}

        {/* ── Filler Material — Filler only ── */}
        {isFiller && (
          <>
            <Text variant="microcopy" format={{ fontWeight: 'bold' }}>
              FILLER MATERIAL
            </Text>
            <Flex direction="row" gap="small">
              <Box flex={1}>
                <Select
                  label="Filler Material"
                  name={`fillerMaterial-${row.id}`}
                  options={FILLER_MATERIALS}
                  value={row.fillerMaterial}
                  onChange={(v) => set('fillerMaterial', v)}
                />
              </Box>
            </Flex>
          </>
        )}

        {/* ── Section 6: Note (optional) ── */}
        <Text variant="microcopy" format={{ fontWeight: 'bold' }}>
          NOTE
        </Text>
        <Box>
          <TextArea
            label="Note (optional)"
            name={`notes-${row.id}`}
            placeholder="Any additional notes for this opening..."
            value={row.notes}
            onChange={(v) => set('notes', v)}
            rows={3}
          />
        </Box>

        <Divider />
      </Flex>
    </Box>
  );
};

// ── Main Tab ──────────────────────────────────────────────────────────────────

export const OpeningsTab = ({ data, onChange }) => {
  const [rows, setRows] = useState(() => {
    if (data?.rows) {
      // Loaded rows from the edit card have a synthetic `id` assigned by
      // EditOrderFunction. Advance _nextId past the highest loaded id so that
      // any newly added rows get a unique id and never collide with loaded ones.
      const maxId = Math.max(0, ...data.rows.map((r) => r.id || 0));
      _nextId = maxId + 1;
      return data.rows;
    }
    _nextId = 1;
    return [createEmptyRow()];
  });

  // Emit state to parent. Three cases:
  //   1. No row started (no cabinet type picked anywhere) → null (optional skip OK)
  //   2. Some rows started but not all are valid → flag _incomplete so parent
  //      blocks Next/Submit
  //   3. All started rows valid → emit { rows }
  useEffect(() => {
    const startedRows = rows.filter(isRowStarted);

    if (startedRows.length === 0) {
      onChange(null);
      return;
    }

    const allStartedValid = startedRows.every(isRowValid);
    if (allStartedValid) {
      onChange({ rows: startedRows });
    } else {
      onChange({ rows: startedRows, _incomplete: true });
    }
  }, [rows]);

  const updateRow = (id, field, value) => {
    setRows((prev) => {
      const updated = prev.map((r) => {
        if (r.id !== id) return r;
        if (field === '__applyTypeDefaults') return applyTypeDefaults(r, value);
        if (field === '__batch') return { ...r, ...value };
        return { ...r, [field]: value };
      });

      if (field === '__applyTypeDefaults' && value === 'Lazy Susan') {
        const sourceRow = updated.find((r) => r.id === id);
        const alreadyHasCompanion = updated.some(
          (r) =>
            r.id !== id &&
            r.cabinetType === 'Lazy Susan' &&
            r._lazySusanCompanionOf === id,
        );
        if (!alreadyHasCompanion && sourceRow) {
          const companionRow = {
            ...createEmptyRow(),
            cabinetType: 'Lazy Susan',
            doorType: sourceRow.doorType || 'Solid',
            widthInches: sourceRow.widthInches,
            widthFraction: sourceRow.widthFraction,
            heightInches: sourceRow.heightInches,
            heightFraction: sourceRow.heightFraction,
            grain: sourceRow.grain,
            bore: 'None LH',
            boreTop: '',
            boreTopFrac: '',
            boreMid: '',
            boreMidFrac: '',
            boreBottom: '',
            boreBottomFrac: '',
            boreOffset: sourceRow.boreOffset,
            _lazySusanCompanionOf: id,
          };
          return [...updated, companionRow];
        }
      }

      return updated;
    });
  };

  const applyBoreOffsetToAll = (offset) => {
    setRows((prev) => prev.map((r) => ({ ...r, boreOffset: offset })));
  };

  // VBA: GrainDirection_AfterUpdate updates rows where Type='" & Me.Type & "'
  // i.e. exact same cabinet type only.
  const applyGrainToSimilar = (id, cabinetType, grain) => {
    if (!cabinetType) return;
    setRows((prev) =>
      prev.map((r) => {
        if (r.id === id) return r;
        if (r.cabinetType === cabinetType) return { ...r, grain };
        return r;
      }),
    );
  };

  const addRow = () => setRows((prev) => [...prev, createEmptyRow()]);
  const deleteRow = (id) => setRows((prev) => prev.filter((r) => r.id !== id));

  // Duplicate a row: an exact copy with a fresh id, inserted right after the
  // original. Clears the Lazy Susan companion link so the copy stands alone.
  // CRITICAL: also clears _recordId and _openingId — the duplicate is a brand
  // new opening, not a copy of the original's HubSpot identity. Without this,
  // updateCabinetOrder would try to PATCH the original record with the
  // duplicate's data instead of CREATEing a new one.
  const duplicateRow = (id) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      if (idx === -1) return prev;
      const copy = {
        ...prev[idx],
        id: _nextId++,
        _recordId: null,
        _openingId: null,
        _lazySusanCompanionOf: null,
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  const doors = rows.filter(
    (r) =>
      r.cabinetType === 'Base' ||
      r.cabinetType === 'Upper' ||
      r.cabinetType === 'Lazy Susan',
  ).length;
  const drawers = rows.filter(
    (r) =>
      r.cabinetType === 'Drawer Front' || r.cabinetType === 'Routed Drawer',
  ).length;
  const other = rows.filter(
    (r) => r.cabinetType === 'Filler' || r.cabinetType === 'Valance',
  ).length;
  const incomplete = rows.filter(
    (r) => isRowStarted(r) && !isRowValid(r),
  ).length;

  return (
    <Flex direction="column" gap="medium">
      <Flex direction="row" justify="between" align="center">
        <Text format={{ fontWeight: 'bold' }}>
          Cabinet Openings ({rows.length})
        </Text>
        <Flex direction="row" gap="small">
          <Tag>Doors: {doors}</Tag>
          <Tag>Drawers: {drawers}</Tag>
          <Tag>Other: {other}</Tag>
          {incomplete > 0 && <Tag variant="error">{incomplete} incomplete</Tag>}
        </Flex>
      </Flex>

      {incomplete > 0 && (
        <Text variant="microcopy">
          ⚠ Once you pick a Cabinet Type, the Door Type, Width, and Height are
          required before continuing.
        </Text>
      )}

      <Divider />

      {rows.map((row, index) => (
        <OpeningCard
          key={row.id}
          row={row}
          index={index}
          total={rows.length}
          updateRow={updateRow}
          deleteRow={deleteRow}
          duplicateRow={duplicateRow}
          applyBoreOffsetToAll={applyBoreOffsetToAll}
          applyGrainToSimilar={applyGrainToSimilar}
        />
      ))}

      <Button onClick={addRow} variant="primary">
        + Add Opening
      </Button>
    </Flex>
  );
};
