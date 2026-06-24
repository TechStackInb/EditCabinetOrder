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

const MOULDING_TYPES = ['Moulding', 'MouldingDetail'];

// ── Numeric only filter ───────────────────────────────────────────────────────
const numericOnly = (value) => value.replace(/[^0-9.]/g, '');

// ── Helpers ───────────────────────────────────────────────────────────────────

let _nextId = 1;

const createEmptyRow = () => ({
  id: _nextId++,
  description: '', // selected moulding's name (display label)
  mouldingId: '', // selected moulding's custom-object ID
  color: '', // selected moulding's partcolor
  inches: '94',
  qty: '',
  ordered: false,
  promptColorMismatch: false,
});

const isRowValid = (row) =>
  Boolean(row.mouldingId && row.inches && row.qty && !row.promptColorMismatch);

// A row counts as "started" when the user has picked a moulding OR entered a qty.
// Started rows must be completed before Next is allowed.
const isRowStarted = (row) => Boolean(row.mouldingId || row.qty);

// ── Single Moulding Card ──────────────────────────────────────────────────────

const MouldingCard = ({
  row,
  index,
  total,
  baseColor,
  showAllColors,
  mouldings,
  updateRow,
  deleteRow,
}) => {
  const valid = isRowValid(row);
  const set = (field, value) => updateRow(row.id, field, value);

  // Build description options from mouldings, filtered by color
  // when 'show all' is OFF and a baseColor is set.
  const descOptions = useMemo(() => {
    const filtered = mouldings.filter((m) => {
      if (showAllColors) return true;
      if (!baseColor) return true;
      return m.properties.partcolor === baseColor;
    });

    return [
      { label: 'Select moulding...', value: '' },
      ...filtered.map((m) => ({
        label: `${m.properties.name || '(no name)'}${
          m.properties.partcolor ? ` — ${m.properties.partcolor}` : ''
        }`,
        value: m.id,
      })),
    ];
  }, [mouldings, baseColor, showAllColors]);

  const handleDescriptionChange = (mouldingId) => {
    if (!mouldingId) {
      updateRow(row.id, '__batch', {
        description: '',
        mouldingId: '',
        color: '',
        promptColorMismatch: false,
      });
      return;
    }

    const m = mouldings.find((x) => x.id === mouldingId);
    if (!m) return;

    const partColor = m.properties.partcolor || '';
    const description = m.properties.name || '';
    const colorMismatches = baseColor && partColor !== baseColor;

    updateRow(row.id, '__batch', {
      mouldingId,
      description,
      color: partColor,
      promptColorMismatch: !!colorMismatches,
    });
  };

  const handleConfirmMismatch = () => {
    set('promptColorMismatch', false);
  };

  const handleRejectMismatch = () => {
    // VBA: Me.Recordset.Delete — clear out the row's selection
    updateRow(row.id, '__batch', {
      mouldingId: '',
      description: '',
      color: '',
      promptColorMismatch: false,
    });
  };

  // VBA: Inches_AfterUpdate → Qty = Int(Inches / 94) + 1
  const handleInchesChange = (v) => {
    const inches = numericOnly(v);
    const inchesNum = parseFloat(inches) || 0;
    const qty = inchesNum > 0 ? String(Math.floor(inchesNum / 94) + 1) : '';
    updateRow(row.id, '__batch', { inches, qty });
  };

  const handleQtyChange = (v) => {
    const qty = numericOnly(v);
    updateRow(row.id, 'qty', qty);
  };

  return (
    <Box>
      <Flex direction="column" gap="medium">
        {/* ── Card Header ── */}
        <Flex direction="row" justify="between" align="center">
          <Flex direction="row" gap="small" align="center">
            <Tag variant={valid ? 'success' : 'error'}>M{index + 1}</Tag>
            <Text format={{ fontWeight: 'bold' }}>
              {row.description || 'New Moulding'}
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
              value={row.mouldingId}
              onChange={handleDescriptionChange}
            />
          </Box>
        </Flex>

        {/* ── Color mismatch warning ── */}
        {row.promptColorMismatch && (
          <Alert title="Color does not match" variant="warning">
            The color of this moulding ({row.color || '—'}) does NOT match the
            base color you selected ({baseColor}). Are you sure you want to
            select this moulding?
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

        {/* ── Inches + Qty + Ordered ── */}
        <Flex direction="row" gap="medium" align="end">
          <Box flex={2}>
            <Input
              label="Inches"
              name={`inches-${row.id}`}
              value={row.inches}
              readOnly
            />
          </Box>
          <Box flex={2}>
            <Input
              label="Qty *"
              name={`qty-${row.id}`}
              placeholder="0"
              value={row.qty}
              onChange={handleQtyChange}
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

export const MouldingsTab = ({ serverData, baseColor, data, onChange }) => {
  const [rows, setRows] = useState(() => {
    if (data?.rows) return data.rows;
    _nextId = 1;
    return [createEmptyRow()];
  });
  const [showAllColors, setShowAllColors] = useState(false);

  // Filter inventory once for moulding types
  const mouldings = useMemo(
    () =>
      (serverData?.inventory ?? []).filter((obj) =>
        MOULDING_TYPES.includes(obj.properties.type)
      ),
    [serverData]
  );

  // Emit state to parent. Three cases:
  //   1. No row started (no mouldings picked anywhere) → null (optional skip OK)
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
      // Save only the started rows; ignore blank placeholder rows.
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
          Mouldings — 94" Long ({rows.length})
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
          Show ALL color options (default: only mouldings matching base color
          {baseColor ? ` "${baseColor}"` : ''})
        </Text>
      </Flex>

      {incomplete > 0 && (
        <Text variant="microcopy">
          ⚠ Once you pick a moulding, Inches and Qty are required before
          continuing.
        </Text>
      )}

      <Divider />

      {/* ── Cards ── */}
      {rows.map((row, index) => (
        <MouldingCard
          key={row.id}
          row={row}
          index={index}
          total={rows.length}
          baseColor={baseColor}
          showAllColors={showAllColors}
          mouldings={mouldings}
          updateRow={updateRow}
          deleteRow={deleteRow}
        />
      ))}

      <Button onClick={addRow} variant="primary">
        + Add Moulding
      </Button>
    </Flex>
  );
};
