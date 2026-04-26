(function () {
  const el = {
    apiBase: document.getElementById("apiBase"),
    apiToken: document.getElementById("apiToken"),
    companySelect: document.getElementById("companySelect"),
    customerSelect: document.getElementById("customerSelect"),
    invoiceDate: document.getElementById("invoiceDate"),
    dueDate: document.getElementById("dueDate"),
    lineItems: document.getElementById("lineItems"),
    status: document.getElementById("status"),
    corsFallback: document.getElementById("corsFallback"),
    corsMessage: document.getElementById("corsMessage"),
    curlExample: document.getElementById("curlExample"),
    btnLoadCompanies: document.getElementById("btnLoadCompanies"),
    btnLoadCustomers: document.getElementById("btnLoadCustomers"),
    btnCreateInvoice: document.getElementById("btnCreateInvoice"),
  };

  const now = new Date();
  const due = new Date(now);
  due.setDate(now.getDate() + 30);
  el.invoiceDate.value = formatDate(now);
  el.dueDate.value = formatDate(due);
  el.lineItems.value = JSON.stringify(
    [
      {
        description: "Konsulttjanster: AcmeCorp",
        quantity: 8,
        unit: "h",
        unitPrice: 1200,
        taxRate: 25,
      },
    ],
    null,
    2
  );

  el.btnLoadCompanies.addEventListener("click", () => loadCompanies());
  el.btnLoadCustomers.addEventListener("click", () =>
    loadCustomers(el.companySelect.value)
  );
  el.btnCreateInvoice.addEventListener("click", () => createInvoice());

  function getConfig() {
    return {
      apiBase: el.apiBase.value.trim().replace(/\/$/, ""),
      token: el.apiToken.value.trim(),
    };
  }

  async function bokioFetch(path, options) {
    const { apiBase, token } = getConfig();
    if (!token) {
      throw new Error("Saknar BOKIO_API_TOKEN.");
    }

    const url = `${apiBase}${path}`;
    const requestInit = {
      method: options?.method || "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    if (options?.body) {
      requestInit.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, requestInit);
      const text = await response.text();
      const payload = safeJsonParse(text);

      if (!response.ok) {
        const msg =
          payload?.message ||
          payload?.error ||
          text ||
          `HTTP ${response.status}`;
        throw new Error(`API-fel ${response.status}: ${msg}`);
      }
      return payload ?? {};
    } catch (error) {
      if (error instanceof TypeError) {
        const message =
          "Direktanrop blockerat (trolig CORS eller natverkspolicy).";
        const corsError = new Error(message);
        corsError.code = "CORS_BLOCKED";
        corsError.path = path;
        corsError.method = requestInit.method;
        corsError.body = options?.body || null;
        throw corsError;
      }
      throw error;
    }
  }

  async function loadCompanies() {
    clearCorsFallback();
    setStatus("Laddar foretag...");
    try {
      const payload = await bokioFetch("/companies");
      const companies = normalizeCompanies(payload);
      fillSelect(el.companySelect, companies, "Valj foretag...");
      fillSelect(el.customerSelect, [], "Valj kund...");
      setStatus(`Hamtade ${companies.length} foretag.`);
    } catch (error) {
      handleError(error);
    }
  }

  async function loadCustomers(companyId) {
    clearCorsFallback();
    if (!companyId) {
      setStatus("Valj foretag forst.");
      return;
    }
    setStatus("Laddar kunder...");
    try {
      const payload = await bokioFetch(`/companies/${companyId}/customers`);
      const customers = normalizeCustomers(payload);
      fillSelect(el.customerSelect, customers, "Valj kund...");
      setStatus(`Hamtade ${customers.length} kunder for foretag ${companyId}.`);
    } catch (error) {
      handleError(error);
    }
  }

  async function createInvoice() {
    clearCorsFallback();
    const companyId = el.companySelect.value;
    const customerId = el.customerSelect.value;

    if (!companyId || !customerId) {
      setStatus("Valj companyId och customerId innan createInvoice(...).");
      return;
    }

    let lineItems;
    try {
      lineItems = JSON.parse(el.lineItems.value);
      if (!Array.isArray(lineItems) || lineItems.length === 0) {
        throw new Error("lineItems maste vara en icke-tom JSON-array.");
      }
    } catch (error) {
      setStatus(`Fel i lineItems JSON: ${error.message}`);
      return;
    }

    const payload = {
      customerId,
      invoiceDate: el.invoiceDate.value || formatDate(new Date()),
      dueDate: el.dueDate.value || formatDate(new Date()),
      currency: "SEK",
      lineItems,
      footerText: "Demo från Bokiofaktura med Tidrapport GCAL/Outlook",
    };

    setStatus("Skapar fakturautkast...");
    try {
      const result = await bokioFetch(`/companies/${companyId}/invoices`, {
        method: "POST",
        body: payload,
      });
      setStatus(
        [
          "Fakturautkast skapat.",
          `Company ID: ${companyId}`,
          `Customer ID: ${customerId}`,
          `Response: ${JSON.stringify(result, null, 2)}`,
        ].join("\n")
      );
    } catch (error) {
      handleError(error, payload, companyId);
    }
  }

  function handleError(error, body, companyId) {
    if (error?.code === "CORS_BLOCKED") {
      showCorsFallback(error, body, companyId);
      setStatus(
        "Anrop stoppades i browsern. Se CORS fallback-sektionen nedan."
      );
      return;
    }
    setStatus(error?.message || "Okant fel.");
  }

  function showCorsFallback(error, body, companyId) {
    const { apiBase } = getConfig();
    const path =
      error.path || (companyId ? `/companies/${companyId}/invoices` : "/companies");
    const method = error.method || "GET";
    const curlBody = body || error.body;
    const bodyString = curlBody ? `-d '${JSON.stringify(curlBody)}'` : "";
    const curl = [
      `curl -X ${method} \\`,
      `  "${apiBase}${path}" \\`,
      `  -H "Authorization: Bearer <DIN_TOKEN>" \\`,
      `  -H "Content-Type: application/json" \\`,
      bodyString,
    ]
      .filter(Boolean)
      .join("\n");

    el.corsMessage.textContent =
      "Detta ser ut som en CORS-blockering. For demo: testa med en lokal proxy eller verifiera endpoint med curl.";
    el.curlExample.textContent = curl;
    el.corsFallback.classList.remove("hidden");
  }

  function clearCorsFallback() {
    el.corsFallback.classList.add("hidden");
    el.corsMessage.textContent = "";
    el.curlExample.textContent = "";
  }

  function setStatus(text) {
    el.status.textContent = text;
  }

  function fillSelect(selectEl, items, placeholder) {
    selectEl.innerHTML = "";
    const first = document.createElement("option");
    first.value = "";
    first.textContent = placeholder;
    selectEl.appendChild(first);

    items.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `${item.name} (${item.id})`;
      selectEl.appendChild(option);
    });
  }

  function normalizeCompanies(payload) {
    const list =
      (Array.isArray(payload) && payload) ||
      payload.companies ||
      payload.data ||
      payload.items ||
      [];
    return list.map((x) => ({
      id: String(x.id ?? x.companyId ?? x.companyID ?? ""),
      name: x.name ?? x.companyName ?? "Okant foretag",
    }));
  }

  function normalizeCustomers(payload) {
    const list =
      (Array.isArray(payload) && payload) ||
      payload.customers ||
      payload.data ||
      payload.items ||
      [];
    return list.map((x) => ({
      id: String(x.id ?? x.customerId ?? x.customerID ?? ""),
      name: x.name ?? x.customerName ?? "Okand kund",
    }));
  }

  function safeJsonParse(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_err) {
      return null;
    }
  }

  function formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // Expose for console-based testing in demo mode.
  window.loadCompanies = loadCompanies;
  window.loadCustomers = loadCustomers;
  window.createInvoice = createInvoice;
})();
