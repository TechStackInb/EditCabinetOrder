import { useState, useEffect, useMemo } from 'react';
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
} from '@hubspot/ui-extensions';

const THERMOFOIL_TYPES = ['Thermofoil', 'ThermofoilDetail'];

const numericOnly = (value) => value.replace(/[^0-9.]/g, '');

let _nextId = 1;

const createEmptyRow = () => ({
  id: _nextId++,
  description: '',
  thermofoilId: '',
  color: '',
  qty: '',
  ordered: false,
  promptColorMismatch: false,
});

const isRowValid = (row) =>
  Boolean(row.thermofoilId && row.qty && !row.promptColorMismatch);

// A row counts as "started" when the user has picked a thermofoil OR entered a qty.
// Started rows must be completed before Next is allowed.
const isRowStarted = (row) => Boolean(row.thermofoilId || row.qty);

// ── Single Thermofoil Card ────────────────────────────────────────────────────

const ThermofoilCard = ({
  row,
  index,
  total,
  baseColor,
  showAllColors,
  thermofoils,
  updateRow,
  deleteRow,
}) => {
  const valid = isRowValid(row);
  const set = (field, value) => updateRow(row.id, field, value);

  const descOptions = useMemo(() => {
    const filtered = thermofoils.filter((m) => {
      if (showAllColors) return true;
      if (!baseColor) return true;
      return m.properties.partcolor === baseColor;
    });

    return [
      { label: 'Select thermofoil...', value: '' },
      ...filtered.map((m) => ({
        label: `${m.properties.name || '(no name)'}${
          m.properties.partcolor ? ` — ${m.properties.partcolor}` : ''
        }`,
        value: m.id,
      })),
    ];
  }, [thermofoils, baseColor, showAllColors]);

  const handleDescriptionChange = (thermofoilId) => {
    if (!thermofoilId) {
      updateRow(row.id, '__batch', {
        description: '',
        thermofoilId: '',
        color: '',
        promptColorMismatch: false,
      });
      return;
    }

    const m = thermofoils.find((x) => x.id === thermofoilId);
    if (!m) return;

    const partColor = m.properties.partcolor || '';
    const description = m.properties.name || '';
    const colorMismatches = baseColor && partColor !== baseColor;

    updateRow(row.id, '__batch', {
      thermofoilId,
      description,
      color: partColor,
      promptColorMismatch: !!colorMismatches,
    });
  };

  const handleConfirmMismatch = () => set('promptColorMismatch', false);

  const handleRejectMismatch = () => {
    updateRow(row.id, '__batch', {
      thermofoilId: '',
      description: '',
      color: '',
      promptColorMismatch: false,
    });
  };

  return (
    <Box>
      <Flex direction="column" gap="medium">
        {/* ── Card Header ── */}
        <Flex direction="row" justify="between" align="center">
          <Flex direction="row" gap="small" align="center">
            <Tag variant={valid ? 'success' : 'error'}>T{index + 1}</Tag>
            <Text format={{ fontWeight: 'bold' }}>
              {row.description || 'New Thermofoil'}
            </Text>
            {row.color && <Tag>{row.color}</Tag>}
            {row.ordered && <Tag variant="info">Ordered</Tag>}
          </Flex>
          <Button
            variant="destructive"
            size="xs"
            onClick={() => deleteRow(row.id)}
            disabled={total === 1}
          >
            Remove
          </Button>
        </Flex>

        {/* ── Description picker ── */}
        <Flex direction="row" gap="small">
          <Box flex={1}>
            <Select
              label="Description *"
              name={`description-${row.id}`}
              options={descOptions}
              value={row.thermofoilId}
              onChange={handleDescriptionChange}
            />
          </Box>
        </Flex>

        {/* ── Color mismatch warning ── */}
        {row.promptColorMismatch && (
          <Alert title="Color does not match" variant="warning">
            The color of this thermofoil ({row.color || '—'}) does NOT match the
            base color you selected ({baseColor}). Are you sure you want to
            select this thermofoil?
            <Flex direction="row" gap="small">
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmMismatch}
              >
                Yes
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRejectMismatch}
              >
                No
              </Button>
            </Flex>
          </Alert>
        )}

        {/* ── LF Qty + Ordered ── */}
        <Flex direction="row" gap="medium" align="end">
          <Box flex={2}>
            <Input
              label="LF Qty *"
              name={`qty-${row.id}`}
              placeholder="0"
              value={row.qty}
              onChange={(v) => set('qty', numericOnly(v))}
            />
          </Box>
          <Box flex={1}>
            <Flex direction="column" gap="extra-small">
              <Text variant="microcopy">Ordered</Text>
              <Checkbox
                name={`ordered-${row.id}`}
                checked={row.ordered}
                onChange={(v) => set('ordered', v)}
              />
            </Flex>
          </Box>
        </Flex>

        <Divider />
      </Flex>
    </Box>
  );
};

// ── Main Tab ──────────────────────────────────────────────────────────────────

export const ThermofoilTab = ({ serverData, baseColor, data, onChange }) => {
  const [rows, setRows] = useState(() => {
    if (data?.rows) return data.rows;
    _nextId = 1;
    return [createEmptyRow()];
  });
  const [showAllColors, setShowAllColors] = useState(false);

  const thermofoils = useMemo(
    () =>
      (serverData?.inventory ?? []).filter((obj) =>
        THERMOFOIL_TYPES.includes(obj.properties.type)
      ),
    [serverData]
  );

  // Emit state to parent. Three cases:
  //   1. No row started (no thermofoil picked anywhere) → null (optional skip OK)
  //   2. Some rows started but not all are valid → flag _incomplete so parent
  //      blocks Next/Submit
  //   3. All started rows valid → emit { rows }
  useEffect(() => {
    const startedRows = rows.filter(isRowStarted);

    if (startedRows.length === 0) {
      onChange?.(null);
      return;
    }

    const allStartedValid = startedRows.every(isRowValid);
    if (allStartedValid) {
      onChange?.({ rows: startedRows });
    } else {
      onChange?.({ rows: startedRows, _incomplete: true });
    }
  }, [rows]);

  const updateRow = (id, field, value) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (field === '__batch') return { ...r, ...value };
        return { ...r, [field]: value };
      })
    );
  };

  const addRow = () => setRows((prev) => [...prev, createEmptyRow()]);
  const deleteRow = (id) => setRows((prev) => prev.filter((r) => r.id !== id));

  // Count only started rows that are incomplete (ignore blank placeholder rows).
  const incomplete = rows.filter(
    (r) => isRowStarted(r) && !isRowValid(r)
  ).length;

  return (
    <Flex direction="column" gap="medium">
      {/* ── Header summary ── */}
      <Flex direction="row" justify="between" align="center">
        <Text format={{ fontWeight: 'bold' }}>
          Thermofoil — 57" Wide ({rows.length})
        </Text>
        <Flex direction="row" gap="small">
          <Tag>Total: {rows.length}</Tag>
          {incomplete > 0 && <Tag variant="error">{incomplete} incomplete</Tag>}
        </Flex>
      </Flex>

      {/* ── Show all colors toggle ── */}
      <Flex direction="row" align="center" gap="small">
        <Checkbox
          name="showAllColors"
          checked={showAllColors}
          onChange={(v) => setShowAllColors(v)}
        />
        <Text variant="microcopy">
          Show ALL color options (default: only thermofoils matching base color
          {baseColor ? ` "${baseColor}"` : ''})
        </Text>
      </Flex>

      {incomplete > 0 && (
        <Text variant="microcopy">
          ⚠ Both a thermofoil and LF Qty are required before continuing.
        </Text>
      )}

      <Divider />

      {/* ── Cards ── */}
      {rows.map((row, index) => (
        <ThermofoilCard
          key={row.id}
          row={row}
          index={index}
          total={rows.length}
          baseColor={baseColor}
          showAllColors={showAllColors}
          thermofoils={thermofoils}
          updateRow={updateRow}
          deleteRow={deleteRow}
        />
      ))}

      <Button onClick={addRow} variant="primary">
        + Add Thermofoil
      </Button>
    </Flex>
  );
};
