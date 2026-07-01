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

const FILL_STICK_TYPES = ['FillStick', 'FillStickDetail'];

const numericOnly = (value) => value.replace(/[^0-9.]/g, '');

let _nextId = 1;

const createEmptyRow = () => ({
  id: _nextId++,
  description: '',
  fillStickId: '',
  color: '',
  qty: '',
  ordered: false,
  promptColorMismatch: false,
});

const isRowValid = (row) =>
  Boolean(row.fillStickId && row.qty && !row.promptColorMismatch);

// A row counts as "started" when the user has picked a fill stick OR entered a qty.
// Started rows must be completed before Next is allowed.
const isRowStarted = (row) => Boolean(row.fillStickId || row.qty);

// A row is removable even when it's the only one left if it represents real
// data — either the user has selected a fill stick (fillStickId), or it was
// loaded from an existing saved line item (_lineItemId, set by the edit
// card's reverse-mapping on LOAD). Only the create flow's genuinely blank
// placeholder row (no selection, no backing record) is protected, so the
// form always has at least one row to start filling in.
const isRemovable = (row, total) =>
  total > 1 || Boolean(row.fillStickId) || Boolean(row._lineItemId);

// ── Single Fill Stick Card ────────────────────────────────────────────────────

const FillStickCard = ({
  row,
  index,
  total,
  orderColors = [],
  showAllColors,
  fillSticks,
  updateRow,
  deleteRow,
}) => {
  const valid = isRowValid(row);
  const set = (field, value) => updateRow(row.id, field, value);

  const descOptions = useMemo(() => {
    const filtered = fillSticks.filter((m) => {
      if (showAllColors) return true;
      if (orderColors.length === 0) return true;
      return orderColors.includes(m.properties.partcolor);
    });

    return [
      { label: 'Select fill stick...', value: '' },
      ...filtered.map((m) => ({
        label: `${m.properties.name || '(no name)'}${
          m.properties.partcolor ? ` — ${m.properties.partcolor}` : ''
        }`,
        value: m.id,
      })),
    ];
  }, [fillSticks, orderColors, showAllColors]);

  const handleDescriptionChange = (fillStickId) => {
    if (!fillStickId) {
      updateRow(row.id, '__batch', {
        description: '',
        fillStickId: '',
        color: '',
        promptColorMismatch: false,
      });
      return;
    }

    const m = fillSticks.find((x) => x.id === fillStickId);
    if (!m) return;

    const partColor = m.properties.partcolor || '';
    const description = m.properties.name || '';
    const colorMismatches =
      orderColors.length > 0 && !orderColors.includes(partColor);

    updateRow(row.id, '__batch', {
      fillStickId,
      description,
      color: partColor,
      promptColorMismatch: !!colorMismatches,
    });
  };

  const handleConfirmMismatch = () => set('promptColorMismatch', false);

  const handleRejectMismatch = () => {
    updateRow(row.id, '__batch', {
      fillStickId: '',
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
            <Tag variant={valid ? 'success' : 'error'}>F{index + 1}</Tag>
            <Text format={{ fontWeight: 'bold' }}>
              {row.description || 'New Fill Stick'}
            </Text>
            {row.color && <Tag>{row.color}</Tag>}
            {row.ordered && <Tag variant="info">Ordered</Tag>}
          </Flex>
          <Button
            variant="destructive"
            size="xs"
            onClick={() => deleteRow(row.id)}
            disabled={!isRemovable(row, total)}
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
              value={row.fillStickId}
              onChange={handleDescriptionChange}
            />
          </Box>
        </Flex>

        {/* ── Color mismatch warning ── */}
        {row.promptColorMismatch && (
          <Alert title="Color does not match" variant="warning">
            The color of this fill stick ({row.color || '—'}) does NOT match any
            of your selected colors ({orderColors.join(', ') || '—'}). Are you
            sure you want to select this fill stick?
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

export const FillSticksTab = ({
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

  const fillSticks = useMemo(
    () =>
      (serverData?.inventory ?? []).filter((obj) =>
        FILL_STICK_TYPES.includes(obj.properties.type),
      ),
    [serverData],
  );

  // Emit state to parent. Three cases:
  //   1. No row started (no fill stick picked anywhere) → null (optional skip OK)
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
  const deleteRow = (id) =>
    setRows((prev) => {
      const filtered = prev.filter((r) => r.id !== id);
      // Never leave the tab with zero rows — if the user just removed the
      // last one, immediately add back a fresh blank placeholder so there's
      // always a card visible to start filling in.
      return filtered.length === 0 ? [createEmptyRow()] : filtered;
    });

  // Count only started rows that are incomplete (ignore blank placeholder rows).
  const incomplete = rows.filter(
    (r) => isRowStarted(r) && !isRowValid(r),
  ).length;

  return (
    <Flex direction="column" gap="medium">
      {/* ── Header summary ── */}
      <Flex direction="row" justify="between" align="center">
        <Text format={{ fontWeight: 'bold' }}>Fill Sticks ({rows.length})</Text>
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
          Show ALL color options (default: only fill sticks matching selected
          colors{orderColors.length ? ` "${orderColors.join(', ')}"` : ''})
        </Text>
      </Flex>

      {incomplete > 0 && (
        <Text variant="microcopy">
          ⚠ Both a fill stick and Qty are required before continuing.
        </Text>
      )}

      <Divider />

      {/* ── Cards ── */}
      {rows.map((row, index) => (
        <FillStickCard
          key={row.id}
          row={row}
          index={index}
          total={rows.length}
          orderColors={orderColors}
          showAllColors={showAllColors}
          fillSticks={fillSticks}
          updateRow={updateRow}
          deleteRow={deleteRow}
        />
      ))}

      <Button onClick={addRow} variant="primary">
        + Add Fill Stick
      </Button>
    </Flex>
  );
};
