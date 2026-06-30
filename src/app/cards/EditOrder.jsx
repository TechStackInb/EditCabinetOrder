import { useState, useEffect } from 'react';
import {
  hubspot,
  Flex,
  Box,
  Button,
  Text,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
  LoadingSpinner,
  Alert,
} from '@hubspot/ui-extensions';

import { DetailsTab } from './components/tabs/DetailsTab';
import { ColorStyleTab } from './components/tabs/ColorStyleTab';
import { OpeningsTab } from './components/tabs/OpeningsTab';
import { MouldingsTab } from './components/tabs/MouldingsTab';
import { LaminateTab } from './components/tabs/LaminateTab';
import { ThermofoilTab } from './components/tabs/ThermofoilTab';
import { FillSticksTab } from './components/tabs/FillSticksTab';

const TABS = [
  { id: 'details', label: 'Details', component: DetailsTab, optional: false },
  {
    id: 'colorStyle',
    label: 'Color/Style',
    component: ColorStyleTab,
    optional: false,
  },
  { id: 'openings', label: 'Openings', component: OpeningsTab, optional: true },
  {
    id: 'mouldings',
    label: 'Mouldings',
    component: MouldingsTab,
    optional: true,
  },
  { id: 'laminate', label: 'Laminate', component: LaminateTab, optional: true },
  {
    id: 'thermofoil',
    label: 'Thermofoil',
    component: ThermofoilTab,
    optional: true,
  },
  {
    id: 'fillSticks',
    label: 'Fill Sticks',
    component: FillSticksTab,
    optional: true,
  },
];

const EMPTY_CABINET_DATA = {
  details: null,
  colorStyle: null,
  openings: null,
  mouldings: null,
  laminate: null,
  thermofoil: null,
  fillSticks: null,
};

// Format a number as USD for display.
const fmtMoney = (n) => `$${Number(n || 0).toFixed(2)}`;

// Read-only priced summary shown in the pre-update Review step.
const ReviewSummary = ({ summary }) => {
  if (!summary) return null;
  const {
    openings = [],
    lineItems = [],
    lineItemsSubtotal = 0,
    totalSqFt = 0,
    doorTotal = 0,
    grandTotal = 0,
    orderNumber = '',
  } = summary;

  return (
    <Flex direction="column" gap="medium">
      <Text format={{ fontWeight: 'bold' }}>
        Order Preview{orderNumber ? ` — ${orderNumber}` : ''}
      </Text>

      {openings.length > 0 && (
        <Box>
          <Text variant="microcopy" format={{ fontWeight: 'bold' }}>
            DOORS, DRAWERS &amp; OPENINGS ({openings.length} item
            {openings.length === 1 ? '' : 's'})
          </Text>
          <Table bordered={true}>
            <TableHead>
              <TableRow>
                <TableHeader>Qty</TableHeader>
                <TableHeader>Specification Details</TableHeader>
                <TableHeader>Sq Ft</TableHeader>
                <TableHeader>Rate</TableHeader>
                <TableHeader>Total</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {openings.map((o, i) => (
                <TableRow key={i}>
                  <TableCell>{o.qty}</TableCell>
                  <TableCell>
                    <Flex direction="column">
                      <Text format={{ fontWeight: 'bold' }}>{o.spec}</Text>
                      <Text variant="microcopy">{o.idLine}</Text>
                    </Flex>
                  </TableCell>
                  <TableCell>{o.sqft}</TableCell>
                  <TableCell>{fmtMoney(o.rate)}</TableCell>
                  <TableCell>{fmtMoney(o.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {lineItems.length > 0 && (
        <Box>
          <Text variant="microcopy" format={{ fontWeight: 'bold' }}>
            ADDITIONAL LINE ITEMS
          </Text>
          <Table bordered={true}>
            <TableHead>
              <TableRow>
                <TableHeader>Product / Service</TableHeader>
                <TableHeader>Quantity</TableHeader>
                <TableHeader>Unit Price</TableHeader>
                <TableHeader>Total Amount</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {lineItems.map((li, i) => (
                <TableRow key={i}>
                  <TableCell>{li.name}</TableCell>
                  <TableCell>{li.qty}</TableCell>
                  <TableCell>{fmtMoney(li.unitPrice)}</TableCell>
                  <TableCell>{fmtMoney(li.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Flex justify="end">
            <Text format={{ fontWeight: 'bold' }}>
              Line Items Subtotal: {fmtMoney(lineItemsSubtotal)}
            </Text>
          </Flex>
        </Box>
      )}

      <Divider />

      <Box>
        <Text variant="microcopy" format={{ fontWeight: 'bold' }}>
          ORDER SUMMARY
        </Text>
        <Flex direction="column" gap="extra-small">
          <Flex justify="between">
            <Text>Total Square Footage</Text>
            <Text>{totalSqFt} sq ft</Text>
          </Flex>
          <Flex justify="between">
            <Text>Door Total</Text>
            <Text>{fmtMoney(doorTotal)}</Text>
          </Flex>
          {lineItems.length > 0 && (
            <Flex justify="between">
              <Text>Line Items Subtotal</Text>
              <Text>{fmtMoney(lineItemsSubtotal)}</Text>
            </Flex>
          )}
          <Divider />
          <Flex justify="between">
            <Text format={{ fontWeight: 'bold' }}>Total Cost</Text>
            <Text format={{ fontWeight: 'bold' }}>{fmtMoney(grandTotal)}</Text>
          </Flex>
        </Flex>
      </Box>
    </Flex>
  );
};

hubspot.extend(({ context, actions, runServerlessFunction }) => (
  <Extension
    context={context}
    sendAlert={actions.addAlert}
    runServerlessFunction={runServerlessFunction}
  />
));

const Extension = ({ context, sendAlert, runServerlessFunction }) => {
  // ── Load state ─────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // ── Server-side data (inventory + HubDB, fetched alongside order load) ──
  const [serverData, setServerData] = useState(null);

  // ── Form state ─────────────────────────────────────────────────────────
  const [activeIndex, setActiveIndex] = useState(0);
  const [cabinetData, setCabinetData] = useState(EMPTY_CABINET_DATA);
  // Bumped on load to force tab components to fully remount with fresh data.
  const [formKey, setFormKey] = useState(0);

  // ── Loaded order info (order_number, dealId — preserved on save) ────────
  const [orderInfo, setOrderInfo] = useState(null);

  // ── Save / review state ────────────────────────────────────────────────
  const [isReviewing, setIsReviewing] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewSummary, setPreviewSummary] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Cabinet Order record ID — comes from CRM context on mount.
  const cabinetOrderId = context?.crm?.objectId;

  // Derived flags.
  const ActiveComponent = TABS[activeIndex].component;
  const isFirst = activeIndex === 0;
  const isLast = activeIndex === TABS.length - 1;
  // All selected front colors (base/upper/drawer), deduped and blanks removed.
  // Material tabs filter their product lists to any of these colors.
  const orderColors = [
    cabinetData.colorStyle?.colorBase,
    cabinetData.colorStyle?.colorUpper,
    cabinetData.colorStyle?.colorDrawer,
  ].filter((c, i, arr) => c && arr.indexOf(c) === i);

  // ── Auto-load on mount ─────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      if (!cabinetOrderId) {
        setLoadError('Could not determine Cabinet Order ID from context.');
        setIsLoading(false);
        return;
      }

      try {
        const response = await runServerlessFunction({
          name: 'EditCabinetOrder_app_function',
          parameters: {
            message: 'LOAD_CABINET_ORDER',
            cabinetOrderId,
          },
        });

        if (response.status !== 'SUCCESS' || response.response?.error) {
          setLoadError(
            response.response?.error || 'Failed to load order. Please refresh.',
          );
          setIsLoading(false);
          return;
        }

        const {
          cabinetData: loaded,
          orderInfo: info,
          serverData: sd,
        } = response.response;

        setServerData(sd);
        setOrderInfo(info);
        setCabinetData(loaded);
        setFormKey((k) => k + 1); // remount all tab components with loaded data
        console.log(
          `[LOAD] order=${info?.orderNumber} openings=${loaded?.openings?.rows?.length ?? 0}`,
        );
      } catch (err) {
        setLoadError(
          `Unexpected error loading order: ${err.message || String(err)}`,
        );
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [cabinetOrderId, runServerlessFunction]);

  // ── Navigation ─────────────────────────────────────────────────────────
  const handleNext = () => {
    const currentTab = TABS[activeIndex];
    const currentData = cabinetData[currentTab.id];
    if (!currentTab.optional && !currentData) {
      sendAlert({
        message: 'Please complete this section before continuing.',
        type: 'danger',
      });
      return;
    }
    if (currentData?._incomplete) {
      sendAlert({
        message: 'Please complete the rows you started before continuing.',
        type: 'danger',
      });
      return;
    }
    if (!isLast) setActiveIndex((prev) => prev + 1);
  };

  const handlePrevious = () => {
    if (!isFirst) setActiveIndex((prev) => prev - 1);
  };

  // Tab-button navigation. Backward is always allowed. Forward validates every
  // tab between the current one and the target — required tabs must have data,
  // and any optional tab the user started must be complete. Empty optional tabs
  // don't block, so jumping ahead stays easy.
  const handleTabClick = (targetIndex) => {
    if (targetIndex === activeIndex) return;
    if (targetIndex < activeIndex) {
      setActiveIndex(targetIndex);
      return;
    }
    for (let i = activeIndex; i < targetIndex; i++) {
      const tab = TABS[i];
      const tabData = cabinetData[tab.id];
      if (!tab.optional && !tabData) {
        sendAlert({
          message: `Please complete the "${tab.label}" section before continuing.`,
          type: 'danger',
        });
        return;
      }
      if (tabData?._incomplete) {
        sendAlert({
          message: `The "${tab.label}" section has rows that need completion before continuing.`,
          type: 'danger',
        });
        return;
      }
    }
    setActiveIndex(targetIndex);
  };

  // ── Review (pre-save preview) ──────────────────────────────────────────
  const handleReview = async () => {
    if (isPreviewLoading) return;

    const currentTab = TABS[activeIndex];
    const currentData = cabinetData[currentTab.id];
    if (!currentTab.optional && !currentData) {
      sendAlert({
        message: 'Please complete this section before continuing.',
        type: 'danger',
      });
      return;
    }
    if (currentData?._incomplete) {
      sendAlert({
        message: 'Please complete the rows you started before continuing.',
        type: 'danger',
      });
      return;
    }
    const incompleteTab = TABS.find(
      (tab) => !tab.optional && !cabinetData[tab.id],
    );
    if (incompleteTab) {
      sendAlert({
        message: `Please complete the "${incompleteTab.label}" section before continuing.`,
        type: 'danger',
      });
      return;
    }
    const partialTab = TABS.find((tab) => cabinetData[tab.id]?._incomplete);
    if (partialTab) {
      sendAlert({
        message: `The "${partialTab.label}" section has rows that need completion before continuing.`,
        type: 'danger',
      });
      return;
    }

    setIsPreviewLoading(true);
    try {
      const response = await runServerlessFunction({
        name: 'EditCabinetOrder_app_function',
        parameters: {
          message: 'PREVIEW_CABINET_ORDER',
          cabinetData,
          orderInfo,
        },
      });

      if (response.status !== 'SUCCESS' || response.response?.error) {
        sendAlert({
          message:
            response.response?.error ||
            'Failed to build order preview. Please try again.',
          type: 'danger',
        });
        return;
      }

      setPreviewSummary(response.response.summary || null);
      setIsReviewing(true);
    } catch (err) {
      sendAlert({
        message: `Unexpected error: ${err.message || String(err)}`,
        type: 'danger',
      });
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleBackToEdit = () => {
    setIsReviewing(false);
    setPreviewSummary(null);
  };

  // ── Save (Confirm & Save from the review screen) ───────────────────────
  const handleSave = async () => {
    if (isSaving) return;
    if (!orderInfo) {
      sendAlert({
        message: 'Order info missing. Please refresh and try again.',
        type: 'danger',
      });
      return;
    }
    if (!cabinetOrderId) {
      sendAlert({
        message: 'Could not determine Cabinet Order ID. Please refresh.',
        type: 'danger',
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await runServerlessFunction({
        name: 'EditCabinetOrder_app_function',
        parameters: {
          message: 'UPDATE_CABINET_ORDER',
          cabinetOrderId,
          cabinetData,
          orderInfo,
        },
      });

      if (response.status !== 'SUCCESS' || response.response?.error) {
        sendAlert({
          message:
            response.response?.error ||
            'Failed to save order. Please try again.',
          type: 'danger',
        });
        setIsSaving(false);
        return;
      }

      const { openingIds, lineItemIds, errors } = response.response || {};

      if (errors && errors.length > 0) {
        sendAlert({
          message: `Order saved with ${errors.length} issue(s). Check console for details.`,
          type: 'warning',
        });
        console.warn('Update flow errors:', errors);
      } else {
        sendAlert({
          message: `Order updated successfully! ${openingIds?.length || 0} openings, ${lineItemIds?.length || 0} line items saved.`,
          type: 'success',
        });
      }

      setSaveSuccess(true);
      setIsReviewing(false);
      setPreviewSummary(null);
    } catch (err) {
      sendAlert({
        message: `Unexpected error: ${err.message || String(err)}`,
        type: 'danger',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ── onChange — writes to the active tab's key ──────────────────────────
  const handleChange = (data) => {
    const currentKey = TABS[activeIndex].id;
    setCabinetData((prev) => {
      const next = { ...prev, [currentKey]: data };
      console.log(next, 'EditOrder cabinetData');
      return next;
    });
    // Clear save-success banner when the user edits after saving.
    if (saveSuccess) setSaveSuccess(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Flex direction="column" align="center" justify="center">
        <LoadingSpinner label="Loading order..." />
      </Flex>
    );
  }

  if (loadError) {
    return (
      <Flex direction="column" gap="small">
        <Text format={{ fontWeight: 'bold' }}>Failed to load order</Text>
        <Text variant="microcopy">{loadError}</Text>
      </Flex>
    );
  }

  // Review screen — replaces the form with the priced summary + confirm/back.
  if (isReviewing) {
    return (
      <Flex direction="column" gap="medium">
        <ReviewSummary summary={previewSummary} />
        <Box>
          <Flex direction="row" justify="between" gap="medium">
            <Button
              variant="secondary"
              onClick={handleBackToEdit}
              disabled={isSaving}
            >
              Back to Edit
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Confirm & Save'}
            </Button>
          </Flex>
        </Box>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="medium">
      {/* Save-success banner */}
      {saveSuccess && (
        <Box>
          <Text format={{ fontWeight: 'bold' }}>
            ✓ Order saved successfully. You can continue editing or close this
            card.
          </Text>
        </Box>
      )}

      {/* Order number badge */}
      {orderInfo?.orderNumber && (
        <Box>
          <Text variant="microcopy">
            Editing order:{' '}
            <Text format={{ fontWeight: 'bold' }}>{orderInfo.orderNumber}</Text>
          </Text>
        </Box>
      )}

      {/* Tab buttons */}
      <Box>
        <Flex direction="row" gap="small" justify="start" wrap="wrap">
          {TABS.map((tab, index) => (
            <Button
              key={tab.id}
              variant={activeIndex === index ? 'primary' : 'secondary'}
              onClick={() => handleTabClick(index)}
              size="sm"
            >
              {tab.label}
            </Button>
          ))}
        </Flex>
      </Box>

      {/* Active tab content */}
      <Box flex={1} alignSelf="stretch">
        <Flex direction="column" gap="medium">
          <Box flex={1}>
            <ActiveComponent
              key={`${TABS[activeIndex].id}-${formKey}`}
              context={context}
              serverData={serverData}
              orderColors={orderColors}
              // Edit card lives on the Cabinet Order — no deal properties to pass.
              // DetailsTab will render with the loaded cabinetData values directly.
              dealProperties={null}
              contactProperties={{}}
              baseNumber={orderInfo?.orderNumber || ''}
              data={cabinetData[TABS[activeIndex].id]}
              onChange={handleChange}
            />
          </Box>

          {/* Footer navigation */}
          <Box>
            <Flex direction="row" justify="between" gap="medium">
              {!isFirst && (
                <Button variant="secondary" onClick={handlePrevious}>
                  Previous
                </Button>
              )}
              <Flex direction="row" gap="medium">
                {!isLast && (
                  <Button variant="primary" onClick={handleNext}>
                    Next
                  </Button>
                )}
                {isLast && (
                  <Button
                    variant="primary"
                    onClick={handleReview}
                    disabled={isPreviewLoading}
                  >
                    {isPreviewLoading
                      ? 'Building Preview...'
                      : 'Review Changes'}
                  </Button>
                )}
              </Flex>
            </Flex>
          </Box>
        </Flex>
      </Box>
    </Flex>
  );
};

export default Extension;
