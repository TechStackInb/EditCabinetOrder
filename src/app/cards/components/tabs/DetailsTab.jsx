import { useState, useEffect } from 'react';
import {
  Flex,
  Box,
  Text,
  Input,
  TextArea,
  Select,
  Divider,
  DateInput,
} from '@hubspot/ui-extensions';

export const DetailsTab = ({
  context,
  dealProperties,
  baseNumber,
  data,
  onChange,
}) => {
  const [formData, setFormData] = useState(
    data ?? {
      description: baseNumber || '',
      cabinetType: '',
      orderType: '',
      shipTo: dealProperties?.franchise_name || '',
      address: dealProperties?.address || '',
      address2: dealProperties?.address_2 || '',
      city: dealProperties?.city || '',
      state: dealProperties?.state || '',
      zip: dealProperties?.zip || '',
      franchiseNo: dealProperties?.franchise_no || '',
      shipOptions: '',
      shipDate: null,
      notes: '',
    }
  );

  const handleChange = (field, value) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);

    const isValid =
      updated.cabinetType && updated.orderType && updated.description;
    onChange(isValid ? updated : null);
  };

  // Backfill prefill fields once Deal data arrives. The hooks in the parent
  // resolve asynchronously, so dealProperties / baseNumber may be empty on the
  // first render(s). This fills ONLY still-empty fields (never clobbers user
  // edits) and is skipped entirely if we're editing an existing order (`data`).
  useEffect(() => {
    if (data) return;
    setFormData((prev) => ({
      ...prev,
      description: prev.description || baseNumber || '',
      shipTo: prev.shipTo || dealProperties?.franchise_name || '',
      address: prev.address || dealProperties?.address || '',
      address2: prev.address2 || dealProperties?.address_2 || '',
      city: prev.city || dealProperties?.city || '',
      state: prev.state || dealProperties?.state || '',
      zip: prev.zip || dealProperties?.zip || '',
      franchiseNo: prev.franchiseNo || dealProperties?.franchise_no || '',
    }));
  }, [baseNumber, dealProperties, data]);

  // Re-validate on mount (and whenever the form changes via the effect above).
  useEffect(() => {
    const isValid = formData.cabinetType && formData.orderType;
    onChange(isValid ? formData : null);
  }, []);

  return (
    <Flex direction="column" gap="large">
      {/* TOP ROW */}
      <Flex direction="row" gap="extra-large" align="start">
        {/* LEFT COLUMN */}
        <Box flex={1}>
          <Flex direction="column" gap="medium">
            <Text variant="microcopy" format={{ fontWeight: 'bold' }}>
              ORDER DETAILS
            </Text>
            <Input
              label="Description *"
              value={formData.description}
              onChange={(v) => handleChange('description', v)}
              name="description"
            />

            {/* Cabinet Type — required */}
            <Select
              label="Cabinet Type *"
              value={formData.cabinetType}
              options={[
                { label: 'Select a type...', value: '' },
                { label: 'Face Frame', value: 'Face Frame' },
                { label: 'European', value: 'European' },
                { label: 'Other', value: 'Other' },
              ]}
              onChange={(v) => handleChange('cabinetType', v)}
            />

            {/* Order Type — required */}
            <Select
              label="Order Type *"
              value={formData.orderType}
              options={[
                { label: 'Select a type...', value: '' },
                { label: 'Normal', value: 'Normal' },
                { label: 'Priority', value: 'Priority' },
                { label: 'Repair', value: 'Repair' },
              ]}
              onChange={(v) => handleChange('orderType', v)}
            />
          </Flex>
        </Box>

        {/* RIGHT COLUMN */}
        <Box flex={2}>
          <Flex direction="column" gap="small">
            <Text variant="microcopy" format={{ fontWeight: 'bold' }}>
              SHIPPING ADDRESS
            </Text>
            <Input
              label="Franchise Name"
              value={formData.shipTo}
              onChange={(v) => handleChange('shipTo', v)}
              name="shipTo"
            />
            <Input
              label="Address"
              value={formData.address}
              onChange={(v) => handleChange('address', v)}
              name="address"
            />
            <Input
              label="Address 2"
              value={formData.address2}
              onChange={(v) => handleChange('address2', v)}
              name="address2"
            />
            <Flex direction="row" gap="small">
              <Box flex={1}>
                <Input
                  label="City"
                  value={formData.city}
                  onChange={(v) => handleChange('city', v)}
                  name="city"
                />
              </Box>
              <Box flex={1}>
                <Input
                  label="State"
                  value={formData.state}
                  onChange={(v) => handleChange('state', v)}
                  name="state"
                />
              </Box>
              <Box flex={1}>
                <Input
                  label="Zip"
                  value={formData.zip}
                  onChange={(v) => handleChange('zip', v)}
                  name="zip"
                />
              </Box>
            </Flex>
          </Flex>
        </Box>
      </Flex>

      <Divider />

      {/* BOTTOM SECTION */}
      <Box>
        <Flex direction="column" gap="medium">
          <Text variant="microcopy" format={{ fontWeight: 'bold' }}>
            SHIPPING DETAILS
          </Text>
          <Flex direction="row" gap="medium">
            <Box flex={1}>
              <Select
                label="Shipping Method"
                value={formData.shipOptions}
                options={[
                  {
                    label: 'Ship Separate Order',
                    value: 'Ship Separate Order',
                  },
                  { label: 'FedEx Ground', value: 'FedEx Ground' },
                  { label: 'UPS Ground', value: 'UPS Ground' },
                ]}
                onChange={(v) => handleChange('shipOptions', v)}
              />
            </Box>
            <Box flex={1}>
              <DateInput
                label="Preferred Ship Date"
                name="shipDate"
                value={formData.shipDate}
                onChange={(v) => handleChange('shipDate', v)}
              />
            </Box>
          </Flex>
          <TextArea
            label="Cabinet Notes"
            rows={3}
            placeholder="Enter notes here..."
            value={formData.notes}
            onChange={(v) => handleChange('notes', v)}
            name="notes"
          />
        </Flex>
      </Box>
    </Flex>
  );
};
