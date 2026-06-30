import { useState, useEffect, useMemo } from 'react';
import {
  Flex,
  Box,
  Select,
  Input,
  Text,
  Divider,
  Alert,
  Image,
} from '@hubspot/ui-extensions';

const REQUIRED_KEYS = [
  'styleBase',
  'styleUpper',
  'styleDrawer',
  'colorBase',
  'colorUpper',
  'colorDrawer',
  'doorBackColorBase',
  'doorBackColorUpper',
  'doorBackColorDrawer',
];

const isComplete = (formData) =>
  REQUIRED_KEYS.every((key) => Boolean(formData[key]));

const SelectRow = ({ label, fieldKey, options, value, onChange }) => (
  <Box>
    <Flex direction="row" align="center" gap="medium" justify="between">
      <Box flex={1}>
        <Text format={{ fontWeight: 'medium' }}>{label}</Text>
      </Box>
      <Box flex={2}>
        <Select
          name={fieldKey}
          label=""
          placeholder="Select…"
          value={value}
          options={options}
          onChange={(val) => onChange(fieldKey, val)}
        />
      </Box>
    </Flex>
  </Box>
);

// Fills Upper/Drawer styles + colors, and each Door Back color, from its
// matching front color — only when empty, never overriding a manual pick.
const applyBaseCascade = (fd) => {
  const result = { ...fd };
  if (result.styleBase) {
    if (!result.styleUpper) result.styleUpper = result.styleBase;
    if (!result.styleDrawer) result.styleDrawer = result.styleBase;
  }
  if (result.colorBase) {
    if (!result.colorUpper) result.colorUpper = result.colorBase;
    if (!result.colorDrawer) result.colorDrawer = result.colorBase;
  }
  // Door back colors mirror their corresponding front color when empty.
  if (result.colorBase && !result.doorBackColorBase)
    result.doorBackColorBase = result.colorBase;
  if (result.colorUpper && !result.doorBackColorUpper)
    result.doorBackColorUpper = result.colorUpper;
  if (result.colorDrawer && !result.doorBackColorDrawer)
    result.doorBackColorDrawer = result.colorDrawer;
  return result;
};

export const ColorStyleTab = ({ serverData, data, onChange }) => {
  // console.log('ColorStyleTab render', { serverData, data });

  // Filter inventory to just Door records (was previously a separate fetch)
  const doors = useMemo(
    () =>
      (serverData?.inventory ?? []).filter(
        (obj) => obj.properties.type === 'Door',
      ),
    [serverData],
  );

  // ── Apply cascade on initial load (mirrors VB Form_Current on navigation) ──
  const [formData, setFormData] = useState(() => {
    const initial = data ?? {
      styleBase: '',
      styleUpper: '',
      styleDrawer: '',
      colorBase: '',
      colorUpper: '',
      colorDrawer: '',
      doorBackColorBase: '',
      doorBackColorUpper: '',
      doorBackColorDrawer: '',
      prefShipDate: '',
    };
    return applyBaseCascade(initial);
  });

  // ── Notify parent whenever formData changes ──────────────────────────────
  useEffect(() => {
    onChange(isComplete(formData) ? formData : null);
  }, [formData]);

  // ── Derived option lists ─────────────────────────────────────────────────
  const styleOptions = doors.map((obj) => ({
    label: obj.properties.name,
    value: obj.properties.name,
  }));

  const colorOptions = (serverData?.hubdb ?? [])
    .filter((row) => row.values.isactive === 1)
    .map((row) => ({
      label: row.values.color,
      value: row.values.color,
    }));

  // ── VB: GBase / GUpper / GFront — group label for a selected style ───────
  const getGroup = (styleName) => {
    if (!styleName) return '';
    const obj = doors.find((o) => o.properties.name === styleName);
    const g = obj?.properties.group ?? '';
    const s = obj?.properties.style ?? '';
    return g && s ? `${g} / ${s}` : g || s;
  };

  // ── VB: BaseMatch / UpperMatch / DrawerMatch — back color label ──────────
  const getMatch = (colorName) => {
    if (!colorName) return '';
    const row = (serverData?.hubdb ?? []).find(
      (r) => r.values.color === colorName,
    );
    return row?.values.match ? 'Matching Back' : 'Industrial Match';
  };

  // Returns the door image URL for a given style name
  const getDoorImage = (styleName) => {
    if (!styleName) return null;
    const obj = doors.find((o) => o.properties.name === styleName);
    const img = obj?.properties.door_images;
    return img || null;
  };

  // Returns the color swatch image URL for a given color name
  const getColorImage = (colorName) => {
    if (!colorName) return null;
    const row = (serverData?.hubdb ?? []).find(
      (r) => r.values.color === colorName,
    );
    const img = row?.values.colorpic;
    if (!img) return null;
    return img.url || null;
  };

  // ── Change handler with VB auto-propagation logic ───────────────────────
  const handleChange = (key, value) => {
    let updated = { ...formData, [key]: value };

    // VB: BaseStyle_AfterUpdate — copy to Upper/Drawer when they are blank
    if (key === 'styleBase') {
      if (!updated.styleUpper) updated.styleUpper = value;
      if (!updated.styleDrawer) updated.styleDrawer = value;
    }

    // VB: BaseColor_AfterUpdate — copy to Upper/Drawer when blank, and seed the
    // door back colors from their (now-filled) matching front colors.
    if (key === 'colorBase') {
      if (!updated.colorUpper) updated.colorUpper = value;
      if (!updated.colorDrawer) updated.colorDrawer = value;
      if (!updated.doorBackColorBase) updated.doorBackColorBase = value;
      if (!updated.doorBackColorUpper)
        updated.doorBackColorUpper = updated.colorUpper;
      if (!updated.doorBackColorDrawer)
        updated.doorBackColorDrawer = updated.colorDrawer;
    }

    // Each Door Back color mirrors its matching front color when still blank.
    if (key === 'colorUpper' && !updated.doorBackColorUpper)
      updated.doorBackColorUpper = value;
    if (key === 'colorDrawer' && !updated.doorBackColorDrawer)
      updated.doorBackColorDrawer = value;

    setFormData(updated);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const styleRows = [
    { label: 'Base', styleKey: 'styleBase' },
    { label: 'Upper', styleKey: 'styleUpper' },
    { label: 'Drawer', styleKey: 'styleDrawer' },
  ];

  const colorRows = [
    { label: 'Base', colorKey: 'colorBase' },
    { label: 'Upper', colorKey: 'colorUpper' },
    { label: 'Drawer', colorKey: 'colorDrawer' },
    { label: 'Door Back Base', colorKey: 'doorBackColorBase' },
    { label: 'Door Back Upper', colorKey: 'doorBackColorUpper' },
    { label: 'Door Back Drawer', colorKey: 'doorBackColorDrawer' },
  ];

  return (
    <Flex direction="column" gap="medium">
      {/* ── Door Style ── */}
      <Text format={{ fontWeight: 'bold' }}>Door Style</Text>

      {styleRows.map(({ label, styleKey }) => {
        const styleValue = formData[styleKey];
        const doorImg = getDoorImage(styleValue);
        return (
          <Flex key={styleKey} direction="column" gap="extra-small">
            <SelectRow
              label={label}
              fieldKey={styleKey}
              options={styleOptions}
              value={styleValue}
              onChange={handleChange}
            />
            {styleValue && getGroup(styleValue) && (
              <Flex direction="row" justify="end">
                <Text>Group: {getGroup(styleValue)}</Text>
              </Flex>
            )}
            {styleValue && doorImg && (
              <Flex direction="row" justify="end">
                <Image src={doorImg} alt={styleValue} width={120} />
              </Flex>
            )}
          </Flex>
        );
      })}

      <Divider />

      {/* ── Color ── */}
      <Text format={{ fontWeight: 'bold' }}>Color</Text>

      {colorRows.map(({ label, colorKey }) => {
        const colorValue = formData[colorKey];
        const colorImg = getColorImage(colorValue);
        return (
          <Flex key={colorKey} direction="column" gap="extra-small">
            <SelectRow
              label={label}
              fieldKey={colorKey}
              options={colorOptions}
              value={colorValue}
              onChange={handleChange}
            />
            {colorValue && !colorKey.startsWith('doorBack') && (
              <Flex direction="row" justify="end">
                <Text>Back Color: {getMatch(colorValue)}</Text>
              </Flex>
            )}
            {colorValue && colorImg && (
              <Flex direction="row" justify="end">
                <Image src={colorImg} alt={colorValue} width={80} />
              </Flex>
            )}
          </Flex>
        );
      })}

      <Divider />

      <Text variant="microcopy">
        Note: Routed Drawers use the same style and color as Base
      </Text>
    </Flex>
  );
};
