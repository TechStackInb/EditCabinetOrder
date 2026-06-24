// ─────────────────────────────────────────────────────────────────────────────
// EditOrderFunction.js
// Handles: LOAD_CABINET_ORDER | UPDATE_CABINET_ORDER | PREVIEW_CABINET_ORDER
//
// PREVIEW_CABINET_ORDER is duplicated here (from CustomCabinetUIExt_function)
// so the edit card is fully self-contained. Pricing logic (priceOpening,
// countBores, findBoreItem, COLOR_UPCHARGE) is identical — one source of truth
// for numbers, just copied to avoid cross-function calls.
// ─────────────────────────────────────────────────────────────────────────────

const HUBDB_TABLE_ID = "323606819";
const OBJECT_TYPE = "2-64007536"; // Inventory
const CABINET_ORDER_TYPE = "2-64007538";
const CABINET_OPENING_TYPE = "2-64007539";
const LINE_ITEM_TYPE = "0-8";
const DEAL_TYPE = "0-3";

const COLOR_UPCHARGE = { 1: 0.0, 2: 1.0, 3: 2.0, STRIP: 1.0, 5: -2.0 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Shared HTTP helpers ──────────────────────────────────────────────────────

async function fetchAllInventory(accessToken) {
  const all = [];
  let after = undefined;
  for (let i = 0; i < 50; i++) {
    if (i > 0) await sleep(300);
    const body = {
      filterGroups: [
        {
          filters: [
            { propertyName: "status", operator: "EQ", value: "Active" },
          ],
        },
      ],
      properties: [
        "type",
        "name",
        "partcolor",
        "group",
        "style",
        "status",
        "subtype",
        "sku",
        "cost",
        "drawercost",
        "unit_price",
        "door_images",
        "filepath1",
        "filepath2",
        "filepath3",
        "filepath4",
        "filepath5",
        "filepath6",
        "material1",
        "material2",
        "railstilesize",
        "item_no",
        "item_name",
      ],
      limit: 100,
    };
    if (after) body.after = after;
    const res = await fetch(
      `https://api.hubapi.com/crm/v3/objects/${OBJECT_TYPE}/search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (res.status === 429) {
      await sleep(2000);
      continue;
    }
    if (!res.ok) {
      const e = await res.text();
      throw new Error(`Inventory fetch: ${res.status} — ${e}`);
    }
    const data = await res.json();
    if (data.results) all.push(...data.results);
    after = data.paging?.next?.after;
    if (!after) break;
  }
  const usedProperties = [
    "type",
    "name",
    "partcolor",
    "group",
    "style",
    "subtype",
    "sku",
    "cost",
    "drawercost",
    "unit_price",
    "filepath1",
    "filepath2",
    "filepath3",
    "filepath4",
    "filepath5",
    "filepath6",
    "material1",
    "material2",
    "railstilesize",
    "item_no",
    "item_name",
  ];
  const trimmed = all.map((record) => {
    const src = record.properties || {};
    const dest = {};
    for (const k of usedProperties) {
      const v = src[k];
      if (v != null && v !== "") dest[k] = v;
    }
    if (src.type === "Door" && src.door_images)
      dest.door_images = src.door_images;
    return { id: record.id, properties: dest };
  });
  console.log(`[fetchAllInventory] ${all.length} records`);
  return trimmed;
}

async function fetchAllHubdbColors(accessToken) {
  const res = await fetch(
    `https://api.hubapi.com/cms/v3/hubdb/tables/${HUBDB_TABLE_ID}/rows`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const e = await res.text();
    throw new Error(`HubDB: ${res.status} — ${e}`);
  }
  const data = await res.json();
  const rows = data.results || [];
  const usedValueFields = [
    "color",
    "group",
    "colortype",
    "isactive",
    "colorpic",
  ];
  const trimmed = rows.map((r) => {
    const src = r.values || {};
    const dest = {};
    for (const k of usedValueFields) {
      const v = src[k];
      if (v != null && v !== "") dest[k] = v;
    }
    return { id: r.id, values: dest };
  });
  console.log(`[fetchAllHubdbColors] ${rows.length} rows`);
  return trimmed;
}

async function getRecord(accessToken, objectType, recordId, properties) {
  const qs = properties.map((p) => `properties=${p}`).join("&");
  const res = await fetch(
    `https://api.hubapi.com/crm/v3/objects/${objectType}/${recordId}?${qs}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const e = await res.text();
    throw new Error(`GET ${objectType}:${recordId} — ${res.status} — ${e}`);
  }
  return res.json();
}

async function getAssociatedObjects(
  accessToken,
  fromType,
  fromId,
  toType,
  properties,
) {
  // Step 1: get associated record IDs via the associations endpoint (returns IDs only, no properties)
  const ids = [];
  let after = undefined;
  for (let page = 0; page < 20; page++) {
    const url =
      `https://api.hubapi.com/crm/v4/objects/${fromType}/${fromId}/associations/${toType}` +
      (after ? `?after=${after}` : "");
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const e = await res.text();
      if (res.status === 404) break; // no associations — return empty
      throw new Error(
        `Associations ${fromType}:${fromId}→${toType}: ${res.status} — ${e}`,
      );
    }
    const data = await res.json();
    for (const r of data.results || []) {
      const id = r.toObjectId || r.id;
      if (id) ids.push(String(id));
    }
    after = data.paging?.next?.after;
    if (!after) break;
  }
  if (ids.length === 0) return [];

  // Step 2: batch-fetch full properties for each associated record
  const qs = properties.map((p) => `properties=${p}`).join("&");
  const records = await Promise.all(
    ids.map(async (id) => {
      const res = await fetch(
        `https://api.hubapi.com/crm/v3/objects/${toType}/${id}?${qs}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        const e = await res.text();
        console.log(
          `[getAssociatedObjects] failed to fetch ${toType}:${id} — ${res.status} — ${e}`,
        );
        return null;
      }
      return res.json();
    }),
  );
  return records.filter(Boolean);
}

async function createRecord(accessToken, objectType, properties) {
  const res = await fetch(
    `https://api.hubapi.com/crm/v3/objects/${objectType}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ properties }),
    },
  );
  if (!res.ok) {
    const e = await res.text();
    throw new Error(`Create ${objectType}: ${res.status} — ${e}`);
  }
  return res.json();
}

async function updateRecord(accessToken, objectType, recordId, properties) {
  const res = await fetch(
    `https://api.hubapi.com/crm/v3/objects/${objectType}/${recordId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ properties }),
    },
  );
  if (!res.ok) {
    const e = await res.text();
    throw new Error(`PATCH ${objectType}:${recordId}: ${res.status} — ${e}`);
  }
  return res.json();
}

async function archiveRecord(accessToken, objectType, recordId) {
  const res = await fetch(
    `https://api.hubapi.com/crm/v3/objects/${objectType}/${recordId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  // 204 = success, 404 = already gone — both are fine
  if (!res.ok && res.status !== 404) {
    const e = await res.text();
    throw new Error(`Archive ${objectType}:${recordId}: ${res.status} — ${e}`);
  }
}

async function associateRecords(accessToken, fromType, fromId, toType, toId) {
  const res = await fetch(
    `https://api.hubapi.com/crm/v4/objects/${fromType}/${fromId}/associations/default/${toType}/${toId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );
  if (!res.ok) {
    const e = await res.text();
    throw new Error(
      `Associate ${fromType}:${fromId}→${toType}:${toId}: ${res.status} — ${e}`,
    );
  }
  return res.json();
}

async function getAssociatedLineItems(accessToken, cabinetOrderId) {
  // HubSpot v4 associations: list line items linked to the cabinet order
  const res = await fetch(
    `https://api.hubapi.com/crm/v4/objects/${CABINET_ORDER_TYPE}/${cabinetOrderId}/associations/${LINE_ITEM_TYPE}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const e = await res.text();
    // 404 means no associations at all — treat as empty
    if (res.status === 404) return [];
    throw new Error(`Get line item associations: ${res.status} — ${e}`);
  }
  const data = await res.json();
  return (data.results || []).map((r) => r.toObjectId || r.id);
}

async function deleteLineItem(accessToken, lineItemId) {
  const res = await fetch(
    `https://api.hubapi.com/crm/v3/objects/${LINE_ITEM_TYPE}/${lineItemId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok && res.status !== 404) {
    const e = await res.text();
    throw new Error(`Delete line item ${lineItemId}: ${res.status} — ${e}`);
  }
}

async function createLineItemWithAssociations(
  accessToken,
  lineItemProps,
  dealId,
  cabinetOrderId,
) {
  const lineItem = await createRecord(
    accessToken,
    LINE_ITEM_TYPE,
    lineItemProps,
  );
  const assocPromises = [
    associateRecords(
      accessToken,
      LINE_ITEM_TYPE,
      lineItem.id,
      CABINET_ORDER_TYPE,
      cabinetOrderId,
    ),
  ];
  if (dealId) {
    assocPromises.push(
      associateRecords(
        accessToken,
        LINE_ITEM_TYPE,
        lineItem.id,
        DEAL_TYPE,
        dealId,
      ),
    );
  }
  await Promise.all(assocPromises);
  return lineItem;
}

// ─── Pricing helpers (identical to CustomCabinetUIExt_function) ──────────────

function fracToDecimal(fracStr) {
  if (!fracStr || fracStr === "--") return 0;
  const idx = fracStr.indexOf("/");
  if (idx === -1) return 0;
  const num = parseFloat(fracStr.substring(0, idx));
  const den = parseFloat(fracStr.substring(idx + 1));
  if (!den) return 0;
  return num / den;
}

function asNumber(whole, frac) {
  return (parseFloat(whole || 0) || 0) + fracToDecimal(frac);
}

function findDoorByName(inventory, name) {
  if (!name) return null;
  return inventory.find(
    (i) => i.properties?.type === "Door" && i.properties?.name === name,
  );
}

function findBoreItem(inventory, label) {
  return inventory.find(
    (i) => i.properties?.type === "Bore" && i.properties?.name === label,
  );
}

function findColorGroup(hubdbColors, colorName) {
  if (!colorName || !Array.isArray(hubdbColors)) return "";
  const row = hubdbColors.find((r) => r.values?.color === colorName);
  if (!row) {
    console.log(`[findColorGroup] no row for color="${colorName}"`);
    return "";
  }
  const g = row?.values?.group;
  if (g != null && typeof g === "object")
    return g.name != null ? String(g.name) : g.id != null ? String(g.id) : "";
  return g != null ? String(g) : "";
}

function getColorUpcharge(group) {
  return COLOR_UPCHARGE[group] ?? 0;
}

function priceOpening(row, inventory, colorStyle, hubdbColors, tag = "?") {
  const logPrefix = `[PRICING ${tag}]`;
  const width = asNumber(row.widthInches, row.widthFraction);
  const height = asNumber(row.heightInches, row.heightFraction);
  if (width <= 0 || height <= 0) {
    console.log(`${logPrefix} skipped — invalid dimensions`);
    return { rate: 0, qty: 0, amount: 0 };
  }
  const qty = Math.round(((width * height) / 144) * 100) / 100;
  let styleName = "",
    useDrawerCost = false,
    colorName = "";
  switch (row.cabinetType) {
    case "Base":
    case "Lazy Susan":
    case "Routed Drawer":
    case "Valance":
      styleName = colorStyle.styleBase || "";
      colorName = colorStyle.colorBase || "";
      break;
    case "Upper":
      styleName = colorStyle.styleUpper || "";
      colorName = colorStyle.colorUpper || "";
      break;
    case "Drawer Front":
    case "Filler":
      styleName = colorStyle.styleDrawer || "";
      colorName = colorStyle.colorDrawer || "";
      useDrawerCost = true;
      break;
    default:
      return { rate: 0, qty, amount: 0 };
  }
  const doorRecord = findDoorByName(inventory, styleName);
  if (!doorRecord) {
    const doorNames = inventory
      .filter((i) => i.properties?.type === "Door")
      .map((i) => i.properties?.name)
      .slice(0, 10);
    console.log(
      `${logPrefix} NO MATCH for Door name="${styleName}". First 10 Door names: ${JSON.stringify(doorNames)}`,
    );
    return { rate: 0, qty, amount: 0 };
  }
  const costField = useDrawerCost ? "drawercost" : "cost";
  const baseCost = parseFloat(doorRecord.properties?.[costField] || "0") || 0;
  const colorGroup = findColorGroup(hubdbColors, colorName);
  const upcharge = getColorUpcharge(colorGroup);
  const rate = baseCost + upcharge;
  const amount = Math.round(rate * qty * 100) / 100;
  console.log(
    `${logPrefix} Door="${doorRecord.properties?.name}" ${costField}=${baseCost} upcharge=${upcharge} qty=${qty} → rate=${rate} amount=${amount}`,
  );
  return { rate, qty, amount };
}

function calculateCabinetRollupPrice(
  openingRows,
  inventory,
  colorStyle,
  hubdbColors,
) {
  let total = 0;
  for (const row of openingRows) {
    const { amount } = priceOpening(row, inventory, colorStyle, hubdbColors);
    total += amount;
  }
  return Math.round(total * 100) / 100;
}

function countBores(openingRows) {
  let standard = 0,
    custom = 0;
  for (const row of openingRows) {
    const bore = row.bore || "None";
    const hasLeft = bore === "Left" || bore.startsWith("L + R");
    const hasRight = bore === "Right" || bore.startsWith("L + R");
    let sides = 0;
    if (hasLeft) sides++;
    if (hasRight) sides++;
    if (sides === 0) continue;
    if (row.customBore) {
      const topVal = asNumber(row.boreTop, row.boreTopFrac);
      const botVal = asNumber(row.boreBottom, row.boreBottomFrac);
      const midVal = asNumber(row.boreMid, row.boreMidFrac);
      let s = 0,
        c = 0;
      if (topVal !== 3) c += sides;
      else s += sides;
      if (botVal !== 3) c += sides;
      else s += sides;
      if (row.midBore && midVal > 0) c += sides;
      standard += s;
      custom += c;
    } else {
      standard += sides * 2;
    }
  }
  return { standard, custom };
}

// ─── CNC JSON helpers (identical to CustomCabinetUIExt_function) ─────────────

function toMm(inches, fraction) {
  return Math.round(asNumber(inches, fraction) * 25.4 * 10) / 10;
}

function getMacroPath(cabinetType, doorType, doorRecord, smallRail) {
  const props = doorRecord?.properties || {};
  switch (cabinetType) {
    case "Base":
    case "Upper":
    case "Lazy Susan":
      return smallRail && props.filepath2
        ? props.filepath2
        : props.filepath1 || "";
    case "Routed Drawer":
      return props.filepath1 || "";
    case "Drawer Front":
      return props.filepath3 || "";
    case "Filler":
      return props.filepath4 || "";
    case "Valance":
      return doorType === "Arch"
        ? props.filepath6 || ""
        : props.filepath5 || "";
    default:
      return props.filepath1 || "";
  }
}

function getBoreArrow(bore) {
  if (bore === "Left") return "q";
  if (bore === "Right") return "r";
  if (bore?.startsWith("L + R")) return "s";
  return " ";
}

function formatDateForCncJson(dateValue) {
  if (!dateValue) return "";
  let d;
  if (typeof dateValue === "number") {
    d = new Date(dateValue);
  } else if (
    typeof dateValue === "object" &&
    dateValue.year &&
    dateValue.month &&
    dateValue.date
  ) {
    d = new Date(dateValue.year, dateValue.month - 1, dateValue.date);
  } else if (typeof dateValue === "string") {
    d = new Date(dateValue);
  }
  if (!d || isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
}

function formatDateForHubSpot(dateValue) {
  if (!dateValue) return null;
  if (typeof dateValue === "number") return dateValue;
  if (
    typeof dateValue === "object" &&
    dateValue.year &&
    dateValue.month &&
    dateValue.date
  ) {
    return Date.UTC(dateValue.year, dateValue.month - 1, dateValue.date);
  }
  if (typeof dateValue === "string") {
    const parsed = Date.parse(dateValue);
    if (!isNaN(parsed)) {
      const d = new Date(parsed);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
  }
  return null;
}

function buildCncJson(
  cabinetData,
  inventory,
  hubdbColors,
  cabinetOrderId,
  openingPrices,
  orderInfo,
) {
  const details = cabinetData.details || {};
  const colorStyle = cabinetData.colorStyle || {};
  const openingRows = cabinetData.openings?.rows || [];
  const doorBackColor = colorStyle.doorBackColor || "";
  const baseDoor = findDoorByName(inventory, colorStyle.styleBase);
  const upperDoor = findDoorByName(inventory, colorStyle.styleUpper);
  const drawerDoor = findDoorByName(inventory, colorStyle.styleDrawer);
  const now = new Date();
  const orderDate = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
  const soNo = orderInfo?.orderNumber || String(cabinetOrderId);
  const franchiseNo = orderInfo?.franchiseNo || details.shipTo || "";
  const franchiseSuffix = orderInfo?.suffix || "000";
  const customerName = orderInfo?.customerName || details.shipTo || "";
  const json = {
    SalesOrderNo: soNo,
    SalesOrderDate: orderDate,
    FranchiseNo: franchiseNo,
    CustomerName: customerName,
    Version: "1.0",
    ShippingOption: details.shipOptions || "",
    PrefShipDate: formatDateForCncJson(details.shipDate),
    SOInfo: [
      {
        PaymentTerms: "",
        ShippingMethod: details.shipOptions || "GROUND",
        ShipVia: "COURIER",
        Carrier: "",
        LogisticsProvider: "Other",
        ServiceLevel: "NONE",
        CustomerNotes: details.notes || "",
        Status: "Draft",
      },
    ],
    SODetails: [],
    Doors: [],
    Parts: [],
  };
  const soPad = soNo.replace(/[^0-9]/g, "").padStart(10, "0");
  for (let i = 0; i < openingRows.length; i++) {
    const row = openingRows[i];
    const pricing = openingPrices[i] || {};
    let doorRecord, color;
    switch (row.cabinetType) {
      case "Base":
      case "Lazy Susan":
      case "Routed Drawer":
      case "Valance":
        doorRecord = baseDoor;
        color = colorStyle.colorBase || "";
        break;
      case "Upper":
        doorRecord = upperDoor;
        color = colorStyle.colorUpper || "";
        break;
      case "Drawer Front":
      case "Filler":
        doorRecord = drawerDoor;
        color = colorStyle.colorDrawer || "";
        break;
      default:
        doorRecord = baseDoor;
        color = colorStyle.colorBase || "";
    }
    if (!doorRecord) continue;
    const props = doorRecord.properties || {};
    const isSmallRail = row.smallRail === true || row.smallRail === "true";
    const macroPath = getMacroPath(
      row.cabinetType,
      row.doorType,
      doorRecord,
      isSmallRail,
    );
    let doorMaterial = props.material1 || "";
    if (row.cabinetType === "Filler" && row.fillerMaterial === "1/4 MDF")
      doorMaterial = props.material2 || props.material1 || "";
    let partMaterial = doorMaterial;
    if (doorBackColor) {
      if (["Lazy Susan", "Filler", "Valance"].includes(row.cabinetType))
        partMaterial = `${doorMaterial}-${doorBackColor} LS`;
      else partMaterial = `${doorMaterial}-${doorBackColor}`;
    }
    const heightMm = toMm(row.heightInches, row.heightFraction);
    const widthMm = toMm(row.widthInches, row.widthFraction);
    const boreTopMm = toMm(row.boreTop, row.boreTopFrac);
    const boreMidMm = toMm(row.boreMid, row.boreMidFrac);
    const boreBottomMm = toMm(row.boreBottom, row.boreBottomFrac);
    const boreOffset =
      row.bore !== "None" && !row.bore?.startsWith("None")
        ? parseFloat(row.boreOffset || 0)
        : 0;
    const doorNum = String(i + 1).padStart(3, "0");
    const serialNo = `${franchiseSuffix}${soPad}${doorNum}00`;
    const boreMacro = `DoorTemplate.PGMX DX=${heightMm} DY=${widthMm} vA=${boreTopMm} vB=${boreMidMm} vC=${boreBottomMm} vD=0 vE=${boreOffset} SNo=${serialNo}`;
    const grain = row.grain || "Vertical";
    let archHeight = " ";
    if (
      row.cabinetType === "Valance" &&
      row.doorType === "Arch" &&
      row.archHeightInches
    )
      archHeight = String(
        asNumber(row.archHeightInches, row.archHeightFraction),
      );
    const railSize = parseFloat(props.railstilesize || 0);
    const halfRail = isSmallRail && railSize > 0 ? String(railSize / 2) : " ";
    let edgeDetail = " ";
    if (row.cabinetType === "Lazy Susan")
      edgeDetail = row.bore?.includes("LH") ? "LH" : "RH";
    json.Doors.push({
      Qty: 1,
      Width: String(asNumber(row.widthInches, row.widthFraction)),
      Height: String(asNumber(row.heightInches, row.heightFraction)),
      PieceID: `D${i + 1}`,
      Color: color,
      Type: row.cabinetType || "",
      Style: props.name || "",
      MacroPath: macroPath,
      PartMaterial: partMaterial,
      Bore: row.bore || "None",
      BoreMacro: boreMacro,
      BackColor: doorBackColor,
      GrainDirection: grain,
      Rotate: 1,
      RotateAngle: 90,
      BoreArrow: getBoreArrow(row.bore),
      Repair: " ",
      EdgeDetail: edgeDetail,
      ArchHeight: archHeight,
      Corners: " ",
      TopRail: halfRail,
      BottomRail: halfRail,
      LeftStile: " ",
      RightStile: " ",
    });
  }
  const doorsByKey = {};
  for (let i = 0; i < openingRows.length; i++) {
    const row = openingRows[i];
    const pricing = openingPrices[i] || {};
    const key = `${row.cabinetType}|${row.cabinetType === "Upper" ? colorStyle.styleUpper : row.cabinetType === "Drawer Front" || row.cabinetType === "Filler" ? colorStyle.styleDrawer : colorStyle.styleBase}`;
    if (!doorsByKey[key])
      doorsByKey[key] = { count: 0, totalAmount: 0, rate: pricing.rate || 0 };
    doorsByKey[key].count += 1;
    doorsByKey[key].totalAmount += pricing.amount || 0;
  }
  for (const [key, val] of Object.entries(doorsByKey)) {
    const [cabinetType, style] = key.split("|");
    json.SODetails.push({
      Description: `${val.count} ${style} ${cabinetType}(s)`,
      Qty: String(val.count),
      Rate: String(Math.round(val.rate * 100) / 100),
      PartNumber: "",
      ItemName: `${style} ${cabinetType}`,
      Amount: String(Math.round(val.totalAmount * 100) / 100),
    });
  }
  const materialTabsForJson = [
    { key: "mouldings", idField: "mouldingId" },
    { key: "laminate", idField: "laminateId" },
    { key: "thermofoil", idField: "thermofoilId" },
    { key: "fillSticks", idField: "fillStickId" },
  ];
  for (const { key, idField } of materialTabsForJson) {
    const rows = cabinetData[key]?.rows || [];
    for (const row of rows) {
      if (!row[idField]) continue;
      const inv = inventory.find((r) => r.id === row[idField]);
      if (!inv) continue;
      const cost = parseFloat(inv.properties?.cost || "0") || 0;
      const qty = parseFloat(row.qty || "0") || 1;
      json.SODetails.push({
        Description: inv.properties?.name || "",
        Qty: String(qty),
        Rate: String(cost),
        PartNumber: inv.properties?.sku || "",
        ItemName: inv.properties?.name || "",
        Amount: String(Math.round(cost * qty * 100) / 100),
      });
    }
  }
  const partCounters = { M: 0, L: 0, T: 0, F: 0 };
  const partTypes = [
    { key: "mouldings", idField: "mouldingId", type: "Molding", prefix: "M" },
    { key: "laminate", idField: "laminateId", type: "Laminate", prefix: "L" },
    {
      key: "thermofoil",
      idField: "thermofoilId",
      type: "Thermofoil",
      prefix: "T",
    },
    {
      key: "fillSticks",
      idField: "fillStickId",
      type: "FillStick",
      prefix: "F",
    },
  ];
  for (const { key, idField, type, prefix } of partTypes) {
    const rows = cabinetData[key]?.rows || [];
    for (const row of rows) {
      if (!row[idField]) continue;
      const inv = inventory.find((r) => r.id === row[idField]);
      if (!inv) continue;
      partCounters[prefix] += 1;
      json.Parts.push({
        Description: inv.properties?.name || "",
        PartNumber: inv.properties?.sku || "",
        Qty: parseFloat(row.qty || "0") || 1,
        Type: type,
        PieceID: `${prefix}${partCounters[prefix]}`,
        Color: inv.properties?.partcolor || "",
      });
    }
  }
  console.log(
    `[CNC JSON] built: ${json.Doors.length} doors, ${json.Parts.length} parts, ${json.SODetails.length} SODetail lines`,
  );
  return json;
}

async function uploadJsonToHubSpot(accessToken, jsonString, fileName) {
  const fileOptions = {
    access: "PUBLIC_INDEXABLE",
    ttl: "P12M",
    overwrite: true,
    duplicateValidationStrategy: "NONE",
    duplicateValidationScope: "ENTIRE_PORTAL",
  };
  const formData = new FormData();
  formData.append("fileName", fileName);
  formData.append("folderPath", "/Cabinet_CNC_JSON");
  formData.append("options", JSON.stringify(fileOptions));
  formData.append(
    "file",
    new Blob([jsonString], { type: "application/json" }),
    fileName,
  );
  const res = await fetch("https://api.hubapi.com/files/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: formData,
  });
  if (!res.ok) {
    const e = await res.text();
    throw new Error(`HubSpot file upload: ${res.status} — ${e}`);
  }
  const data = await res.json();
  console.log(`[CNC JSON] uploaded. ID=${data.id}`);
  return data.url || "";
}

// ─── Property mappers ─────────────────────────────────────────────────────────

function buildCabinetOrderProperties(cabinetData, inventory) {
  const details = cabinetData.details || {};
  const colorStyle = cabinetData.colorStyle || {};
  const lookupImageUrl = (styleName) => {
    if (!styleName || !Array.isArray(inventory)) return "";
    const doorRecord = inventory.find(
      (r) => r.properties?.type === "Door" && r.properties?.name === styleName,
    );
    const raw = doorRecord?.properties?.door_images || "";
    if (!raw) return "";
    return String(raw).split(",")[0].trim();
  };
  return {
    order_name: details.description || "",
    cabinet_type: details.cabinetType || "",
    order_type: details.orderType || "",
    franchise_name: details.shipTo || "",
    address: details.address || "",
    address_2: details.address2 || "",
    city: details.city || "",
    state: details.state || "",
    zip: details.zip || "",
    shipping_method: details.shipOptions || "",
    preferred_ship_date: formatDateForHubSpot(details.shipDate),
    cabinet_notes: details.notes || "",
    base_style: colorStyle.styleBase || "",
    upper_style: colorStyle.styleUpper || "",
    drawer_style: colorStyle.styleDrawer || "",
    base_color: colorStyle.colorBase || "",
    upper_color: colorStyle.colorUpper || "",
    drawer_color: colorStyle.colorDrawer || "",
    door_back_color: colorStyle.doorBackColor || "",
    base_image_url: lookupImageUrl(colorStyle.styleBase),
    upper_image_url: lookupImageUrl(colorStyle.styleUpper),
    drawer_image_url: lookupImageUrl(colorStyle.styleDrawer),
  };
}

function buildCabinetOpeningProperties(row, index, pricing) {
  const bool = (v) => (v ? "true" : "false");
  const props = {
    opening_id: `D${index + 1}`,
    cabinet_type: row.cabinetType || "",
    door_type: row.doorType || "",
    width_inches: row.widthInches || "0",
    width_fraction: row.widthFraction || "",
    height_inches: row.heightInches || "0",
    height_fraction: row.heightFraction || "",
    grain_direction: row.grain || "",
    bore: row.bore || "None",
    bore_offset: row.boreOffset || "0",
    bore_top: row.boreTop || "0",
    bore_top_fraction: row.boreTopFrac || "",
    bore_mid: row.boreMid || "0",
    bore_mid_fraction: row.boreMidFrac || "",
    bore_bottom: row.boreBottom || "0",
    bore_bottom_fraction: row.boreBottomFrac || "",
    mid_bore_checkbox: bool(row.midBore),
    small_rail_checkbox: bool(row.smallRail),
    oversized_checkbox: bool(row.oversized),
    custom_bore_checkbox: bool(row.customBore),
    ordered_checkbox: bool(row.ordered),
    arch_height_inches: row.archHeightInches || "0",
    arch_height_fraction: row.archHeightFraction || "",
    filler_material: row.fillerMaterial || "",
    notes: row.notes || "",
  };
  if (pricing) {
    props.rate = pricing.rate;
    props.qty_sqft = pricing.qty;
    props.amount = pricing.amount;
  }
  return props;
}

// ─── LOAD: Cabinet Order props → cabinetData shape ───────────────────────────

function parseDateFromEpoch(epochMs) {
  if (!epochMs) return null;
  const n = typeof epochMs === "string" ? parseInt(epochMs, 10) : epochMs;
  if (isNaN(n)) return null;
  const d = new Date(n);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    date: d.getUTCDate(),
  };
}

function parseBool(v) {
  return v === "true" || v === true;
}

function mapOrderToDetails(p) {
  return {
    description: p.order_name || "",
    cabinetType: p.cabinet_type || "",
    orderType: p.order_type || "",
    shipTo: p.franchise_name || "",
    address: p.address || "",
    address2: p.address_2 || "",
    city: p.city || "",
    state: p.state || "",
    zip: p.zip || "",
    shipOptions: p.shipping_method || "",
    shipDate: parseDateFromEpoch(p.preferred_ship_date),
    notes: p.cabinet_notes || "",
    franchiseNo: "", // not stored on Cabinet Order; comes from Deal
  };
}

function mapOrderToColorStyle(p) {
  return {
    styleBase: p.base_style || "",
    styleUpper: p.upper_style || "",
    styleDrawer: p.drawer_style || "",
    colorBase: p.base_color || "",
    colorUpper: p.upper_color || "",
    colorDrawer: p.drawer_color || "",
    doorBackColor: p.door_back_color || "",
  };
}

function mapOpeningToRow(p, recordId) {
  return {
    // Stable identity — carried through form untouched on every field update
    _openingId: p.opening_id || null,
    _recordId: recordId || null,
    cabinetType: p.cabinet_type || "",
    doorType: p.door_type || "",
    widthInches: p.width_inches || "0",
    widthFraction: p.width_fraction || "",
    heightInches: p.height_inches || "0",
    heightFraction: p.height_fraction || "",
    grain: p.grain_direction || "",
    bore: p.bore || "None",
    boreOffset: p.bore_offset || "0",
    boreTop: p.bore_top || "0",
    boreTopFrac: p.bore_top_fraction || "",
    boreMid: p.bore_mid || "0",
    boreMidFrac: p.bore_mid_fraction || "",
    boreBottom: p.bore_bottom || "0",
    boreBottomFrac: p.bore_bottom_fraction || "",
    midBore: parseBool(p.mid_bore_checkbox),
    smallRail: parseBool(p.small_rail_checkbox),
    oversized: parseBool(p.oversized_checkbox),
    customBore: parseBool(p.custom_bore_checkbox),
    ordered: parseBool(p.ordered_checkbox),
    archHeightInches: p.arch_height_inches || "0",
    archHeightFraction: p.arch_height_fraction || "",
    fillerMaterial: p.filler_material || "",
    notes: p.notes || "",
  };
}

// ─── LOAD action ──────────────────────────────────────────────────────────────

async function loadCabinetOrder(accessToken, cabinetOrderId) {
  // 1. Fetch all data in parallel: order props, openings, line items, inventory, HubDB
  const orderPropertiesNeeded = [
    "order_name",
    "order_number",
    "cabinet_type",
    "order_type",
    "franchise_name",
    "address",
    "address_2",
    "city",
    "state",
    "zip",
    "shipping_method",
    "preferred_ship_date",
    "cabinet_notes",
    "base_style",
    "upper_style",
    "drawer_style",
    "base_color",
    "upper_color",
    "drawer_color",
    "door_back_color",
    "customer_firstname",
    "customer_lastname",
    "cnc_json_url",
  ];

  const openingPropertiesNeeded = [
    "opening_id",
    "cabinet_type",
    "door_type",
    "width_inches",
    "width_fraction",
    "height_inches",
    "height_fraction",
    "grain_direction",
    "bore",
    "bore_offset",
    "bore_top",
    "bore_top_fraction",
    "bore_mid",
    "bore_mid_fraction",
    "bore_bottom",
    "bore_bottom_fraction",
    "mid_bore_checkbox",
    "small_rail_checkbox",
    "oversized_checkbox",
    "custom_bore_checkbox",
    "ordered_checkbox",
    "arch_height_inches",
    "arch_height_fraction",
    "filler_material",
    "notes",
    "rate",
    "qty_sqft",
    "amount",
  ];

  const [orderRecord, rawOpenings, inventory, hubdbColors] = await Promise.all([
    getRecord(
      accessToken,
      CABINET_ORDER_TYPE,
      cabinetOrderId,
      orderPropertiesNeeded,
    ),
    getAssociatedObjects(
      accessToken,
      CABINET_ORDER_TYPE,
      cabinetOrderId,
      CABINET_OPENING_TYPE,
      openingPropertiesNeeded,
    ),
    fetchAllInventory(accessToken),
    fetchAllHubdbColors(accessToken),
  ]);

  const op = orderRecord.properties || {};

  // 2. Get the associated Deal ID so we can re-associate new line items
  let dealId = null;
  try {
    const dealAssoc = await getAssociatedObjects(
      accessToken,
      CABINET_ORDER_TYPE,
      cabinetOrderId,
      DEAL_TYPE,
      ["dealname"],
    );
    dealId = dealAssoc?.[0]?.id || null;
    console.log(`[LOAD] associated dealId=${dealId}`);
  } catch (e) {
    console.log(
      `[LOAD] could not fetch deal association (non-fatal): ${e.message}`,
    );
  }

  // 3. Sort openings by opening_id (D1, D2, D3 …) for stable ordering
  const sortedOpenings = [...rawOpenings].sort((a, b) => {
    const numA = parseInt(
      (a.properties?.opening_id || "D0").replace(/\D/g, ""),
      10,
    );
    const numB = parseInt(
      (b.properties?.opening_id || "D0").replace(/\D/g, ""),
      10,
    );
    return numA - numB;
  });

  // Assign a synthetic `id` matching OpeningsTab's internal row key convention.
  // Loaded rows don't come from createEmptyRow() so they have no `id` — without
  // it, updateRow/deleteRow (which key by row.id) can't find them.
  // We use the D-number as the id (1, 2, 3…) so they're stable and don't
  // collide with newly added rows (which start _nextId from 1, but the tab
  // resets _nextId only on a fresh mount — using large offsets avoids collision).
  const openingRows = sortedOpenings.map((o, i) => ({
    ...mapOpeningToRow(o.properties || {}, o.id),
    id: i + 1, // stable React key for OpeningsTab's updateRow/deleteRow
  }));

  // 4. Build cabinetData
  const cabinetData = {
    details: mapOrderToDetails(op),
    colorStyle: mapOrderToColorStyle(op),
    openings: openingRows.length > 0 ? { rows: openingRows } : null,
    mouldings: null,
    laminate: null,
    thermofoil: null,
    fillSticks: null,
  };

  // NOTE: Material tabs (mouldings, laminate, thermofoil, fillSticks) are NOT
  // stored as Cabinet Opening properties — they are line items with no stable
  // natural key mapping back to inventory IDs. They are left null here and the
  // user will need to re-enter them on edit. This is a known limitation noted
  // in the handoff; a future improvement would be to store material selections
  // on the Cabinet Order record directly.

  const orderInfo = {
    orderNumber: op.order_number || "",
    customerFirstName: op.customer_firstname || "",
    customerLastName: op.customer_lastname || "",
    customerName:
      `${op.customer_firstname || ""} ${op.customer_lastname || ""}`.trim(),
    franchiseNo: "", // from Deal — not stored on Cabinet Order
    suffix: (op.order_number || "").split("-")[0] || "000",
    dealId,
  };

  console.log(
    `[LOAD] order=${orderInfo.orderNumber} openings=${openingRows.length} dealId=${dealId}`,
  );

  return {
    cabinetData,
    orderInfo,
    serverData: {
      inventory,
      hubdb: hubdbColors,
      inventoryCount: inventory.length,
    },
  };
}

// ─── PREVIEW action (self-contained copy) ────────────────────────────────────

function buildPreviewSummary(cabinetData, inventory, hubdbColors, orderInfo) {
  const colorStyle = cabinetData.colorStyle || {};
  const openingRows = cabinetData.openings?.rows || [];

  const openings = openingRows.map((row, i) => {
    const { rate, qty, amount } = priceOpening(
      row,
      inventory,
      colorStyle,
      hubdbColors,
      `D${i + 1}`,
    );
    const width = asNumber(row.widthInches, row.widthFraction);
    const height = asNumber(row.heightInches, row.heightFraction);
    const spec = `${row.cabinetType || ""} - ${width}" x ${height}"`;
    const idLine = `ID: D${i + 1} | Door: ${row.doorType || "N/A"} | Bore: ${row.bore || "None"} | Offset: ${row.boreOffset || "0"} | Grain: ${row.grain || "Vertical"}`;
    return { qty: 1, spec, idLine, sqft: qty, rate, total: amount };
  });

  const doorTotal =
    Math.round(openings.reduce((s, o) => s + (o.total || 0), 0) * 100) / 100;
  const totalSqFt =
    Math.round(openings.reduce((s, o) => s + (o.sqft || 0), 0) * 100) / 100;
  const lineItems = [];

  const { standard: standardBores, custom: customBores } =
    countBores(openingRows);
  if (standardBores > 0) {
    const bi = findBoreItem(inventory, "Bore Charge");
    const cost = parseFloat(bi?.properties?.cost || "0") || 0;
    lineItems.push({
      name: "Bore Charge",
      qty: standardBores,
      unitPrice: cost,
      total: Math.round(standardBores * cost * 100) / 100,
    });
  }
  if (customBores > 0) {
    const bi = findBoreItem(inventory, "Custom Bore Charge");
    const cost = parseFloat(bi?.properties?.cost || "0") || 0;
    lineItems.push({
      name: "Custom Bore Charge",
      qty: customBores,
      unitPrice: cost,
      total: Math.round(customBores * cost * 100) / 100,
    });
  }

  const materialTabs = [
    { key: "mouldings", idField: "mouldingId" },
    { key: "laminate", idField: "laminateId" },
    { key: "thermofoil", idField: "thermofoilId" },
    { key: "fillSticks", idField: "fillStickId" },
  ];
  for (const { key, idField } of materialTabs) {
    const rows = cabinetData[key]?.rows || [];
    for (const row of rows) {
      if (!row[idField]) continue;
      const inv = inventory.find((r) => r.id === row[idField]);
      if (!inv) continue;
      const unitPrice = parseFloat(inv.properties?.cost || "0") || 0;
      const qty = parseFloat(row.qty || "0") || 1;
      lineItems.push({
        name: inv.properties?.name || "(unnamed)",
        qty,
        unitPrice,
        total: Math.round(unitPrice * qty * 100) / 100,
      });
    }
  }

  const lineItemsSubtotal =
    Math.round(lineItems.reduce((s, li) => s + (li.total || 0), 0) * 100) / 100;
  const grandTotal = Math.round((doorTotal + lineItemsSubtotal) * 100) / 100;

  console.log(
    `[PREVIEW] openings=${openings.length} doorTotal=${doorTotal} lineItems=${lineItems.length} subtotal=${lineItemsSubtotal} grand=${grandTotal}`,
  );
  return {
    orderNumber: orderInfo?.orderNumber || "",
    openings,
    lineItems,
    lineItemsSubtotal,
    totalSqFt,
    doorTotal,
    grandTotal,
  };
}

// ─── UPDATE action ────────────────────────────────────────────────────────────

async function updateCabinetOrder(
  accessToken,
  cabinetOrderId,
  cabinetData,
  inventory,
  hubdbColors,
  orderInfo,
) {
  const results = {
    cabinetOrderId,
    orderNumber: orderInfo.orderNumber,
    openingIds: [],
    lineItemIds: [],
    errors: [],
  };

  const dealId = orderInfo.dealId || null;

  // 1. PATCH the Cabinet Order properties (order_number stays unchanged)
  const cabinetOrderProps = buildCabinetOrderProperties(cabinetData, inventory);
  // Preserve the existing order_number — never bump on edit
  cabinetOrderProps.order_number = orderInfo.orderNumber;
  cabinetOrderProps.order_name =
    cabinetData.details?.description || orderInfo.orderNumber;
  cabinetOrderProps.customer_firstname = orderInfo.customerFirstName || "";
  cabinetOrderProps.customer_lastname = orderInfo.customerLastName || "";
  await updateRecord(
    accessToken,
    CABINET_ORDER_TYPE,
    cabinetOrderId,
    cabinetOrderProps,
  );
  console.log(`[UPDATE] patched Cabinet Order ${cabinetOrderId}`);

  // 2. Smart-diff openings using _recordId and _openingId carried from LOAD.
  //
  //    Each row loaded from HubSpot has _recordId (HubSpot record ID) and
  //    _openingId (e.g. "D1"). OpeningsTab spreads these on every field update
  //    so they survive all user edits and arrive here unchanged.
  //
  //    Cases:
  //      row._recordId set   → existing opening → PATCH by record ID
  //      row._recordId null  → user added a new row → CREATE + associate
  //      existing record not present in newOpeningRows → user removed it → ARCHIVE
  //
  //    opening_id on save: existing rows keep their original D-number.
  //    New rows get the next available D-number (max existing + increment).

  const newOpeningRows = cabinetData.openings?.rows || [];
  const colorStyle = cabinetData.colorStyle || {};

  // Build set of record IDs still present after edit (for archive detection)
  const retainedRecordIds = new Set(
    newOpeningRows.map((r) => r._recordId).filter(Boolean),
  );

  // Fetch all existing opening record IDs so we know what to archive
  const existingOpenings = await getAssociatedObjects(
    accessToken,
    CABINET_ORDER_TYPE,
    cabinetOrderId,
    CABINET_OPENING_TYPE,
    ["opening_id"],
  );
  const existingRecordIds = existingOpenings.map((o) => o.id);

  // Determine next D-number for any newly added rows
  const existingDNums = existingOpenings
    .map((o) =>
      parseInt((o.properties?.opening_id || "D0").replace(/\D/g, ""), 10),
    )
    .filter((n) => !isNaN(n));
  let nextDNum = existingDNums.length > 0 ? Math.max(...existingDNums) + 1 : 1;

  const openingPrices = newOpeningRows.map((row, i) =>
    priceOpening(
      row,
      inventory,
      colorStyle,
      hubdbColors,
      row._openingId || `D${i + 1}`,
    ),
  );

  // PATCH existing / CREATE new
  await Promise.all(
    newOpeningRows.map(async (row, i) => {
      const pricing = openingPrices[i];
      try {
        if (row._recordId) {
          // Existing opening — PATCH in place, preserve record ID and opening_id
          const props = buildCabinetOpeningProperties(
            { ...row, openingIdOverride: row._openingId },
            i,
            pricing,
          );
          // Keep the original opening_id, don't let buildCabinetOpeningProperties re-derive it
          props.opening_id = row._openingId;
          await updateRecord(
            accessToken,
            CABINET_OPENING_TYPE,
            row._recordId,
            props,
          );
          results.openingIds.push(row._recordId);
          console.log(
            `[UPDATE] patched opening ${row._openingId} (record ${row._recordId})`,
          );
        } else {
          // New row added by user — assign next available D-number
          const newOpeningId = `D${nextDNum++}`;
          const props = buildCabinetOpeningProperties(row, i, pricing);
          props.opening_id = newOpeningId;
          const newOpening = await createRecord(
            accessToken,
            CABINET_OPENING_TYPE,
            props,
          );
          await associateRecords(
            accessToken,
            CABINET_OPENING_TYPE,
            newOpening.id,
            CABINET_ORDER_TYPE,
            cabinetOrderId,
          );
          results.openingIds.push(newOpening.id);
          console.log(
            `[UPDATE] created new opening ${newOpeningId} (record ${newOpening.id})`,
          );
        }
      } catch (err) {
        const label = row._openingId || `row ${i + 1}`;
        results.errors.push(`Opening ${label}: ${err?.message || String(err)}`);
      }
    }),
  );

  // ARCHIVE removed openings (existed before, not retained after edit)
  const removedRecordIds = existingRecordIds.filter(
    (id) => !retainedRecordIds.has(id),
  );
  await Promise.all(
    removedRecordIds.map(async (recordId) => {
      try {
        await archiveRecord(accessToken, CABINET_OPENING_TYPE, recordId);
        console.log(`[UPDATE] archived removed opening record ${recordId}`);
      } catch (err) {
        results.errors.push(
          `Archive opening ${recordId}: ${err?.message || String(err)}`,
        );
      }
    }),
  );

  // 3. Delete-and-recreate line items (no stable natural key)
  try {
    const existingLineItemIds = await getAssociatedLineItems(
      accessToken,
      cabinetOrderId,
    );
    console.log(
      `[UPDATE] deleting ${existingLineItemIds.length} existing line items`,
    );
    await Promise.all(
      existingLineItemIds.map((id) => deleteLineItem(accessToken, id)),
    );
  } catch (err) {
    results.errors.push(`Delete line items: ${err?.message || String(err)}`);
  }

  const rollupPrice =
    Math.round(
      openingPrices.reduce((sum, p) => sum + (p.amount || 0), 0) * 100,
    ) / 100;
  const { standard: standardBores, custom: customBores } =
    countBores(newOpeningRows);
  console.log(
    `[ROLLUP] $${rollupPrice} | [BORES] standard=${standardBores} custom=${customBores}`,
  );

  const materialTabs = [
    { key: "mouldings", idField: "mouldingId" },
    { key: "laminate", idField: "laminateId" },
    { key: "thermofoil", idField: "thermofoilId" },
    { key: "fillSticks", idField: "fillStickId" },
  ];
  const lineItemPromises = [];

  if (openingPrices.length > 0) {
    lineItemPromises.push(
      (async () => {
        try {
          const li = await createLineItemWithAssociations(
            accessToken,
            {
              name: `Cabinet — ${cabinetOrderProps.order_name || "Custom"}`,
              quantity: 1,
              price: rollupPrice,
            },
            dealId,
            cabinetOrderId,
          );
          results.lineItemIds.push(li.id);
        } catch (err) {
          results.errors.push(`Cabinet rollup: ${err?.message || String(err)}`);
        }
      })(),
    );
  }
  if (standardBores > 0) {
    lineItemPromises.push(
      (async () => {
        try {
          const bi = findBoreItem(inventory, "Bore Charge");
          const cost = parseFloat(bi?.properties?.cost || "0") || 0;
          const li = await createLineItemWithAssociations(
            accessToken,
            {
              name: "Bore Charge",
              quantity: standardBores,
              price: cost,
              hs_sku: bi?.properties?.sku || "",
            },
            dealId,
            cabinetOrderId,
          );
          results.lineItemIds.push(li.id);
        } catch (err) {
          results.errors.push(`Bore Charge: ${err?.message || String(err)}`);
        }
      })(),
    );
  }
  if (customBores > 0) {
    lineItemPromises.push(
      (async () => {
        try {
          const bi = findBoreItem(inventory, "Custom Bore Charge");
          const cost = parseFloat(bi?.properties?.cost || "0") || 0;
          const li = await createLineItemWithAssociations(
            accessToken,
            {
              name: "Custom Bore Charge",
              quantity: customBores,
              price: cost,
              hs_sku: bi?.properties?.sku || "",
            },
            dealId,
            cabinetOrderId,
          );
          results.lineItemIds.push(li.id);
        } catch (err) {
          results.errors.push(
            `Custom Bore Charge: ${err?.message || String(err)}`,
          );
        }
      })(),
    );
  }
  for (const { key, idField } of materialTabs) {
    const rows = cabinetData[key]?.rows || [];
    rows.forEach((row, i) => {
      if (!row[idField]) return;
      lineItemPromises.push(
        (async () => {
          try {
            const invRecord = inventory.find((r) => r.id === row[idField]);
            if (!invRecord)
              throw new Error(`Inventory record ${row[idField]} not found`);
            const li = await createLineItemWithAssociations(
              accessToken,
              {
                name: invRecord.properties?.name || "(unnamed)",
                quantity: parseFloat(row.qty || "0") || 1,
                price: parseFloat(invRecord.properties?.cost || "0") || 0,
                hs_sku: invRecord.properties?.sku || "",
              },
              dealId,
              cabinetOrderId,
            );
            results.lineItemIds.push(li.id);
          } catch (err) {
            results.errors.push(
              `${key} row ${i + 1}: ${err?.message || String(err)}`,
            );
          }
        })(),
      );
    });
  }
  await Promise.all(lineItemPromises);

  // 4. Re-generate and re-upload CNC JSON (overwrite by same filename)
  let cncJsonUrl = "";
  if (newOpeningRows.length > 0) {
    try {
      const cncJson = buildCncJson(
        cabinetData,
        inventory,
        hubdbColors,
        cabinetOrderId,
        openingPrices,
        orderInfo,
      );
      const jsonString = JSON.stringify(cncJson);
      const jsonFileName = `${orderInfo.orderNumber}.json`;
      cncJsonUrl = await uploadJsonToHubSpot(
        accessToken,
        jsonString,
        jsonFileName,
      );
      console.log(`[CNC JSON] re-uploaded: ${cncJsonUrl}`);
    } catch (err) {
      console.log("[CNC JSON] failed:", err?.message);
      results.errors.push(`CNC JSON: ${err?.message || String(err)}`);
    }
  }

  // 5. Final PATCH: custom_cabinet_ordered + updated CNC URL
  try {
    const finalPatch = { custom_cabinet_ordered: "Yes" };
    if (cncJsonUrl) finalPatch.cnc_json_url = cncJsonUrl;
    await updateRecord(
      accessToken,
      CABINET_ORDER_TYPE,
      cabinetOrderId,
      finalPatch,
    );
    console.log(`[UPDATE] final patch done. cabinetOrderId=${cabinetOrderId}`);
  } catch (err) {
    results.errors.push(`Final PATCH: ${err?.message || String(err)}`);
  }

  return results;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

exports.main = async (context = {}) => {
  const ACCESS_TOKEN = process.env.PRIVATE_APP_ACCESS_TOKEN;
  try {
    if (!ACCESS_TOKEN) throw new Error("Missing PRIVATE_APP_ACCESS_TOKEN");
    const { message } = context.parameters;
    console.log(`[EditOrderFunction] action: ${message}`);

    // ── LOAD ────────────────────────────────────────────────────────────────
    if (message === "LOAD_CABINET_ORDER") {
      const { cabinetOrderId } = context.parameters;
      if (!cabinetOrderId) throw new Error("Missing cabinetOrderId");
      const result = await loadCabinetOrder(ACCESS_TOKEN, cabinetOrderId);
      return result;
    }

    // ── PREVIEW ─────────────────────────────────────────────────────────────
    if (message === "PREVIEW_CABINET_ORDER") {
      const {
        cabinetData,
        orderInfo,
        inventory: passedInventory,
        hubdbColors: passedHubdbColors,
      } = context.parameters;
      let inventory = passedInventory,
        hubdbColors = passedHubdbColors;
      const fetches = [];
      if (!Array.isArray(inventory) || inventory.length === 0)
        fetches.push(
          fetchAllInventory(ACCESS_TOKEN).then((r) => (inventory = r)),
        );
      if (!Array.isArray(hubdbColors) || hubdbColors.length === 0)
        fetches.push(
          fetchAllHubdbColors(ACCESS_TOKEN).then((r) => (hubdbColors = r)),
        );
      if (fetches.length) await Promise.all(fetches);
      const summary = buildPreviewSummary(
        cabinetData,
        inventory,
        hubdbColors,
        orderInfo,
      );
      return { success: true, summary };
    }

    // ── UPDATE ──────────────────────────────────────────────────────────────
    if (message === "UPDATE_CABINET_ORDER") {
      const { cabinetOrderId, cabinetData, orderInfo } = context.parameters;
      if (!cabinetOrderId) throw new Error("Missing cabinetOrderId");
      if (!cabinetData) throw new Error("Missing cabinetData");
      if (!orderInfo?.orderNumber) throw new Error("Missing orderNumber");

      const [inventory, hubdbColors] = await Promise.all([
        fetchAllInventory(ACCESS_TOKEN),
        fetchAllHubdbColors(ACCESS_TOKEN),
      ]);

      const result = await updateCabinetOrder(
        ACCESS_TOKEN,
        cabinetOrderId,
        cabinetData,
        inventory,
        hubdbColors,
        orderInfo,
      );
      return { success: true, ...result };
    }

    return { error: `Unknown message: ${message}` };
  } catch (err) {
    console.log("[EditOrderFunction] error:", err);
    return { error: err.message || String(err) };
  }
};
