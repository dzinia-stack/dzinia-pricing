const sourceInfoEl = document.getElementById("sourceInfo");
const sectionDropdownsEl = document.getElementById("sectionDropdowns");
const quantityInput = document.getElementById("quantityInput");
const priceMainEl = document.getElementById("priceMain");
const priceTotalEl = document.getElementById("priceTotal");
const priceMetaEl = document.getElementById("priceMeta");

const addToQuoteBtn = document.getElementById("addToQuoteBtn");
const clearQuoteBtn = document.getElementById("clearQuoteBtn");
const printQuoteBtn = document.getElementById("printQuoteBtn");
const quoteBodyEl = document.getElementById("quoteBody");
const quoteCountEl = document.getElementById("quoteCount");
const quoteGrandEl = document.getElementById("quoteGrand");

const state = {
  services: [],
  quoteItems: [],
  activeServiceId: null
};

function inr(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toNumberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveUnitPrice(service) {
  const finalPrice = toNumberOrNull(service.final_price);
  const basePrice = toNumberOrNull(service.base_price);

  if (finalPrice !== null) {
    return { amount: finalPrice, label: "Final (incl. GST)", available: true };
  }

  if (basePrice !== null) {
    return { amount: basePrice, label: "Base price", available: true };
  }

  return { amount: null, label: "Unavailable", available: false };
}

function getSections() {
  const set = new Set(state.services.map((s) => (s.section || "Other").trim() || "Other"));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function buildSectionDropdowns() {
  sectionDropdownsEl.innerHTML = "";

  const sections = getSections();
  let firstServiceId = null;

  sections.forEach((section) => {
    const wrapper = document.createElement("div");
    wrapper.className = "section-card";

    const label = document.createElement("label");
    label.className = "section-title";
    const sectionSlug = section.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const selectId = `section-select-${sectionSlug}`;
    label.setAttribute("for", selectId);
    label.textContent = section;

    const select = document.createElement("select");
    select.id = selectId;
    select.dataset.section = section;

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = `Select from ${section}`;
    select.appendChild(placeholder);

    const sectionServices = state.services.filter((s) => (s.section || "Other") === section);
    sectionServices.forEach((service) => {
      const option = document.createElement("option");
      option.value = service.id;
      option.textContent = service.service;
      select.appendChild(option);

      if (!firstServiceId) {
        firstServiceId = service.id;
      }
    });

    wrapper.appendChild(label);
    wrapper.appendChild(select);
    sectionDropdownsEl.appendChild(wrapper);
  });

  if (!state.activeServiceId && firstServiceId) {
    state.activeServiceId = firstServiceId;
    const firstSelect = sectionDropdownsEl.querySelector("select");
    if (firstSelect) {
      firstSelect.value = firstServiceId;
    }
  }
}

function clearOtherSectionSelections(changedSelect) {
  const allSelects = sectionDropdownsEl.querySelectorAll("select[data-section]");
  allSelects.forEach((select) => {
    if (select !== changedSelect) {
      select.value = "";
    }
  });
}

function getSelectedService() {
  if (state.activeServiceId) {
    return state.services.find((s) => s.id === state.activeServiceId) || null;
  }

  const currentSelect = sectionDropdownsEl.querySelector("select[data-section][value]");
  if (currentSelect && currentSelect.value) {
    return state.services.find((s) => s.id === currentSelect.value) || null;
  }

  return null;
}

function renderPricing() {
  const service = getSelectedService();
  const qty = Math.max(1, Number(quantityInput.value) || 1);

  if (!service) {
    priceMainEl.textContent = "-";
    priceTotalEl.textContent = "-";
    priceMetaEl.textContent = "Select a service from any section dropdown.";
    return;
  }

  const unitPrice = resolveUnitPrice(service);
  if (!unitPrice.available) {
    priceMainEl.textContent = "Price unavailable";
    priceTotalEl.textContent = "Total: -";
    priceMetaEl.textContent = `${service.scope || "No description"} | Please set this price in Excel.`;
    return;
  }

  const total = unitPrice.amount * qty;
  priceMainEl.textContent = `${inr(unitPrice.amount)} / ${service.unit || "unit"}`;
  priceTotalEl.textContent = `Total (${qty}): ${inr(total)}`;

  const gst = toNumberOrNull(service.gst_price);
  const gstText = gst !== null ? `GST ${inr(gst)}` : "GST not set";
  priceMetaEl.textContent = `${service.section || "Other"} • ${unitPrice.label}. ${gstText}. ${service.scope || ""}`.trim();
}

function renderQuote() {
  if (!state.quoteItems.length) {
    quoteBodyEl.innerHTML = '<tr><td colspan="5">No items in quote yet.</td></tr>';
    quoteCountEl.textContent = "Items: 0";
    quoteGrandEl.textContent = "Grand Total: -";
    return;
  }

  quoteBodyEl.innerHTML = state.quoteItems
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.section)}</td>
        <td>${escapeHtml(item.service)}</td>
        <td>${item.qty}</td>
        <td>${escapeHtml(item.unitText)}</td>
        <td>${escapeHtml(item.totalText)}</td>
      </tr>
    `
    )
    .join("");

  const total = state.quoteItems.reduce((sum, item) => sum + item.totalAmount, 0);
  quoteCountEl.textContent = `Items: ${state.quoteItems.length}`;
  quoteGrandEl.textContent = `Grand Total: ${inr(total)}`;
}

function addToQuote() {
  const service = getSelectedService();
  const qty = Math.max(1, Number(quantityInput.value) || 1);
  if (!service) return;

  const unit = resolveUnitPrice(service);
  if (!unit.available) {
    alert("Selected service does not have numeric price in Excel.");
    return;
  }

  const total = unit.amount * qty;

  state.quoteItems.push({
    section: service.section || "Other",
    service: service.service,
    qty,
    unitText: inr(unit.amount),
    totalText: inr(total),
    totalAmount: total
  });

  renderQuote();
}

function clearQuote() {
  state.quoteItems = [];
  renderQuote();
}

function buildPrintHtml() {
  const dateText = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date());

  const rows = state.quoteItems
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.section)}</td>
        <td>${escapeHtml(item.service)}</td>
        <td>${item.qty}</td>
        <td>${escapeHtml(item.unitText)}</td>
        <td>${escapeHtml(item.totalText)}</td>
      </tr>
    `
    )
    .join("");

  return `
  <!doctype html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Dzinia Quotation</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
      h1 { margin: 0 0 6px; }
      .meta { color: #444; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
      th { background: #f2f2f2; }
      .summary { margin-top: 14px; font-weight: 700; }
    </style>
  </head>
  <body>
    <h1>Dzinia Designing Services - Quotation</h1>
    <div class="meta">Date: ${dateText}<br/>Source: ${escapeHtml(sourceInfoEl.textContent)}</div>
    <table>
      <thead>
        <tr>
          <th>Section</th>
          <th>Service</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="summary">${escapeHtml(quoteGrandEl.textContent)}</div>
  </body>
  </html>
  `;
}

function printQuote() {
  if (!state.quoteItems.length) {
    alert("Add at least one item to the quotation first.");
    return;
  }

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    alert("Please allow pop-ups to print the quotation.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildPrintHtml());
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function onSectionServiceChange(event) {
  const select = event.target;
  if (!(select instanceof HTMLSelectElement)) return;
  if (!select.matches("select[data-section]")) return;

  if (select.value) {
    state.activeServiceId = select.value;
    clearOtherSectionSelections(select);
  } else {
    state.activeServiceId = null;
  }

  renderPricing();
}

async function loadServices() {
  if (window.SERVICES_DATA && Array.isArray(window.SERVICES_DATA.services)) {
    const data = window.SERVICES_DATA;
    state.services = data.services;
    sourceInfoEl.textContent = `${data.source_file || "Excel"} • ${data.sheet || "Sheet"} • ${state.services.length} services`;
    buildSectionDropdowns();
    renderPricing();
    renderQuote();
    return;
  }

  try {
    const response = await fetch("services.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    state.services = Array.isArray(data.services) ? data.services : [];
    sourceInfoEl.textContent = `${data.source_file || "Excel"} • ${data.sheet || "Sheet"} • ${state.services.length} services`;

    buildSectionDropdowns();
    renderPricing();
    renderQuote();
  } catch (err) {
    sourceInfoEl.textContent = `Failed to load services.json (${err.message})`;
    renderPricing();
    renderQuote();
  }
}

sectionDropdownsEl.addEventListener("change", onSectionServiceChange);
quantityInput.addEventListener("input", renderPricing);
addToQuoteBtn.addEventListener("click", addToQuote);
clearQuoteBtn.addEventListener("click", clearQuote);
printQuoteBtn.addEventListener("click", printQuote);

loadServices();

// ── Expose globals so index.html inline scripts can access them ──
window.state = state;
window.inr = inr;
window.escapeHtml = escapeHtml;
window.renderPricing = renderPricing;
window.renderQuote = renderQuote;
window.addToQuote = addToQuote;
