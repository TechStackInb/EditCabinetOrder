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

const LAMINATE_TYPES = ['Laminate', 'PSLaminate', 'LaminateDetail'];

const numericOnly = (value) => value.replace(/[^0-9.]/g, '');

let _nextId = 1;

const createEmptyRow = () => ({
  id: _nextId++,
  description: '',
  laminateId: '',
  color: '',
  qty: '',
  ordered: false,
  promptColorMismatch: false,
});

const isRowValid = (row) =>
  Boolean(row.laminateId && row.qty && !row.promptColorMismatch);

// A row counts as "started" when the user has picked a laminate OR entered a qty.
// Started rows must be completed before Next is allowed.
const isRowStarted = (row) => Boolean(row.laminateId || row.qty);

// ── Single Laminate Card ──────────────────────────────────────────────────────

const LaminateCard = ({
  row,
  index,
  total,
  orderColors = [],
  showAllColors,
  laminates,
  updateRow,
  deleteRow,
}) => {
  const valid = isRowValid(row);
  const set = (field, value) => updateRow(row.id, field, value);

  const descOptions = useMemo(() => {
    const filtered = laminates.filter((m) => {
      if (showAllColors) return true;
      if (orderColors.length === 0) return true;
      return orderColors.includes(m.properties.partcolor);
    });

    return [
      { label: 'Select laminate...', value: '' },
      ...filtered.map((m) => ({
        label: `${m.properties.name || '(no name)'}${
          m.properties.partcolor ? ` — ${m.properties.partcolor}` : ''
        }`,
        value: m.id,
      })),
    ];
  }, [laminates, orderColors, showAllColors]);

  const handleDescriptionChange = (laminateId) => {
    if (!laminateId) {
      updateRow(row.id, '__batch', {
        description: '',
        laminateId: '',
        color: '',
        promptColorMismatch: false,
      });
      return;
    }

    const m = laminates.find((x) => x.id === laminateId);
    if (!m) return;

    const partColor = m.properties.partcolor || '';
    const description = m.properties.name || '';
    const colorMismatches =
      orderColors.length > 0 && !orderColors.includes(partColor);

    updateRow(row.id, '__batch', {
      laminateId,
      description,
      color: partColor,
      promptColorMismatch: !!colorMismatches,
    });
  };

  const handleConfirmMismatch = () => set('promptColorMismatch', false);

  const handleRejectMismatch = () => {
    updateRow(row.id, '__batch', {
      laminateId: '',
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
            <Tag variant={valid ? 'success' : 'error'}>L{index + 1}</Tag>
            <Text format={{ fontWeight: 'bold' }}>
              {row.description || 'New Laminate'}
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
              value={row.laminateId}
              onChange={handleDescriptionChange}
            />
          </Box>
        </Flex>

        {/* ── Color mismatch warning ── */}
        {row.promptColorMismatch && (
          <Alert title="Color does not match" variant="warning">
            The color of this laminate ({row.color || '—'}) does NOT match any
            of your selected colors ({orderColors.join(', ') || '—'}). Are you
            sure you want to select this laminate?
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

        {/* ── Qty + Ordered ── */}
        <Flex direction="row" gap="medium" align="end">
          <Box flex={2}>
            <Input
              label="Qty *"
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

export const LaminateTab = ({
  serverData,
  orderColors = [],
  data,
  onChange,
}) => {
  const [rows, setRows] = useState(() => {
    if (data?.rows) return data.rows;
    _nextId = 1;
    return [createEmptyRow()];
  });
  const [showAllColors, setShowAllColors] = useState(false);

  const laminates = useMemo(
    () =>
      (serverData?.inventory ?? []).filter((obj) =>
        LAMINATE_TYPES.includes(obj.properties.type),
      ),
    [serverData],
  );

  // Emit state to parent. Three cases:
  //   1. No row started (no laminate picked anywhere) → null (optional skip OK)
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
      }),
    );
  };

  const addRow = () => setRows((prev) => [...prev, createEmptyRow()]);
  const deleteRow = (id) => setRows((prev) => prev.filter((r) => r.id !== id));

  // Count only started rows that are incomplete (ignore blank placeholder rows).
  const incomplete = rows.filter(
    (r) => isRowStarted(r) && !isRowValid(r),
  ).length;

  return (
    <Flex direction="column" gap="medium">
      {/* ── Header summary ── */}
      <Flex direction="row" justify="between" align="center">
        <Text format={{ fontWeight: 'bold' }}>
          Laminate — 48"×96" ({rows.length})
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
          Show ALL color options (default: only laminates matching selected
          colors{orderColors.length ? ` "${orderColors.join(', ')}"` : ''})
        </Text>
      </Flex>

      {incomplete > 0 && (
        <Text variant="microcopy">
          ⚠ Both a laminate and Qty are required before continuing.
        </Text>
      )}

      <Divider />

      {/* ── Cards ── */}
      {rows.map((row, index) => (
        <LaminateCard
          key={row.id}
          row={row}
          index={index}
          total={rows.length}
          orderColors={orderColors}
          showAllColors={showAllColors}
          laminates={laminates}
          updateRow={updateRow}
          deleteRow={deleteRow}
        />
      ))}

      <Button onClick={addRow} variant="primary">
        + Add Laminate
      </Button>
    </Flex>
  );
};
