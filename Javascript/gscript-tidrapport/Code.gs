/**
 * Google Apps Script Web App backend for the read-only tidrapport-export page.
 *
 * This script fetches an ICS calendar and returns an aggregated text export. This is a
 * deliberately separate, minimal deployment from Javascript/gscript/Code.gs (which
 * also creates Bokio invoices).
 *
 * Request (GET query params):
 * {
 *   "action": "getTidrapport",
 *   "yearMonth": "2026-04",
 *   "prefix": "ACME"
 * }
 *
 * Calendar URL is read only from Script Property KALENDER_TIDRAPPORT_URL — it is never
 * accepted from the request.
 */
function doGet(e) {
  try {
    var req = parseGetRequest(e);
    return handleRequest(req);
  } catch (err) {
    return jsonResponse(500, { error: String(err) }, req && req.callback);
  }
}

function parseGetRequest(e) {
  var params = (e && e.parameter) || {};
  return {
    action: params.action,
    yearMonth: params.yearMonth,
    prefix: params.prefix,
    callback: getJsonpCallbackName(params.callback),
  };
}

function handleRequest(req) {
  var callback = req && req.callback;
  var action = String((req && req.action) || "").trim();
  if (action !== "getTidrapport") {
    return jsonResponse(400, { error: "Unsupported action. Use action=getTidrapport." }, callback);
  }

  var result = getTidrapport(req || {});
  return jsonResponse(200, result, callback);
}

function getTidrapport(req) {
  var scriptProps = PropertiesService.getScriptProperties().getProperties();
  var yearMonth = String(req.yearMonth || "").trim();
  var prefix = String(req.prefix || "").trim();
  var calendarUrl = String(scriptProps.KALENDER_TIDRAPPORT_URL || "").trim();

  if (!calendarUrl) throw new Error("Missing Script Property KALENDER_TIDRAPPORT_URL.");
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) throw new Error("yearMonth must be yyyy-mm.");

  var icsResponse = UrlFetchApp.fetch(calendarUrl, { muteHttpExceptions: true });
  if (icsResponse.getResponseCode() >= 400) {
    throw new Error("Calendar fetch failed: HTTP " + icsResponse.getResponseCode());
  }

  var entries = extractEntriesFromIcs(icsResponse.getContentText(), yearMonth, prefix);
  if (entries.length === 0) {
    return {
      message: "Ingen data hittades i kalendern för denna period/prefix.",
      yearMonth: yearMonth,
      prefix: prefix || "",
      entriesCount: 0,
      exportText: "",
    };
  }

  var weekData = aggregateEntries(entries);
  var exportText = buildExportText(weekData);

  return {
    message: "Tidrapport hämtad.",
    yearMonth: yearMonth,
    prefix: prefix || "",
    entriesCount: entries.length,
    exportText: exportText,
  };
}

function extractEntriesFromIcs(icsText, yearMonth, prefix) {
  var lines = unfoldIcsLines(icsText || "");
  var entries = [];
  var current = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) {
        var subject = String(current.summary || "").trim();
        if (subject) {
          if (!prefix || subject.toUpperCase().indexOf(prefix.toUpperCase()) === 0) {
            var dtStart = parseIcsDateValue(current.dtstart || "");
            var dtEnd = parseIcsDateValue(current.dtend || "");
            if (dtStart && dtEnd) {
              var startYm = Utilities.formatDate(dtStart, Session.getScriptTimeZone(), "yyyy-MM");
              if (startYm === yearMonth) {
                var duration = round2((dtEnd.getTime() - dtStart.getTime()) / 3600000);
                if (duration > 0) {
                  entries.push({
                    subject: subject,
                    startDate: Utilities.formatDate(
                      dtStart,
                      Session.getScriptTimeZone(),
                      "yyyy-MM-dd"
                    ),
                    duration: duration,
                    start: dtStart,
                  });
                }
              }
            }
          }
        }
      }
      current = null;
      continue;
    }

    if (!current) continue;
    if (line.indexOf("SUMMARY:") === 0) current.summary = line.substring(8);
    if (line.indexOf("DTSTART") === 0) current.dtstart = afterColon(line);
    if (line.indexOf("DTEND") === 0) current.dtend = afterColon(line);
  }

  return entries.sort(function (a, b) {
    return a.start.getTime() - b.start.getTime();
  });
}

function aggregateEntries(entries) {
  var weekData = {}; // key: "year-week" -> { year, week, projects: { subject: [7dayHours] } }

  entries.forEach(function (entry) {
    var subject = String(entry.subject || "").trim();
    if (!subject || subject.toLowerCase() === "friskvård") return;
    if (entry.duration <= 0) return;

    var iso = getIsoWeekParts(entry.start);
    var weekKey = iso.year + "-" + iso.week;
    if (!weekData[weekKey]) weekData[weekKey] = { year: iso.year, week: iso.week, projects: {} };
    if (!weekData[weekKey].projects[subject]) weekData[weekKey].projects[subject] = [0, 0, 0, 0, 0, 0, 0];
    weekData[weekKey].projects[subject][iso.weekdayIndex] = round2(
      weekData[weekKey].projects[subject][iso.weekdayIndex] + entry.duration
    );
  });

  return weekData;
}

function buildExportText(weekData) {
  var keys = Object.keys(weekData).sort(function (a, b) {
    var aw = weekData[a].year * 100 + weekData[a].week;
    var bw = weekData[b].year * 100 + weekData[b].week;
    return aw - bw;
  });
  if (keys.length === 0) return "";

  var COL = 30;
  var out = [];
  out.push("Kopiera blocken nedan och klistra in direkt i Excel eller Agresso.");
  out.push("");

  keys.forEach(function (wk) {
    var w = weekData[wk];
    out.push("--- VECKA " + w.week + " (" + w.year + ") ---");
    var dates = getWeekDates(w.year, w.week);
    var dateHeaders = dates
      .map(function (d) {
        return d.getDate() + "/" + (d.getMonth() + 1);
      })
      .join("\t");
    out.push(padRight("Aktivitet".substring(0, COL), COL) + "\t" + dateHeaders + "\tTotalt");

    Object.keys(w.projects)
      .sort()
      .forEach(function (subject) {
        var days = w.projects[subject];
        var total = round2(
          days.reduce(function (acc, x) {
            return acc + x;
          }, 0)
        );
        var dayText = days
          .map(function (x) {
            return x > 0 ? String(round2(x)) : "0";
          })
          .join("\t");
        out.push(padRight(subject.substring(0, COL), COL) + "\t" + dayText + "\t" + total);
      });
    out.push("");
  });

  return out.join("\n");
}

function getWeekDates(year, week) {
  var jan4 = new Date(Date.UTC(year, 0, 4));
  var jan4Day = jan4.getUTCDay() || 7; // Mon=1..Sun=7
  var monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (week - 1) * 7);
  var out = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    out.push(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  return out;
}

function getIsoWeekParts(dateObj) {
  var d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
  var day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return {
    year: d.getUTCFullYear(),
    week: week,
    weekdayIndex: (dateObj.getDay() + 6) % 7, // Monday=0
  };
}

function unfoldIcsLines(text) {
  var raw = text.replace(/\r/g, "").split("\n");
  var lines = [];
  for (var i = 0; i < raw.length; i++) {
    var line = raw[i];
    if (!line) continue;
    if ((line[0] === " " || line[0] === "\t") && lines.length > 0) {
      lines[lines.length - 1] += line.substring(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function parseIcsDateValue(value) {
  if (!value) return null;
  var v = value.trim();
  // Skip all-day entries (DATE only), matching python behavior.
  if (/^\d{8}$/.test(v)) return null;

  var m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!m) return null;
  var year = Number(m[1]);
  var month = Number(m[2]) - 1;
  var day = Number(m[3]);
  var hour = Number(m[4]);
  var minute = Number(m[5]);
  var second = Number(m[6]);
  if (v.endsWith("Z")) return new Date(Date.UTC(year, month, day, hour, minute, second));
  return new Date(year, month, day, hour, minute, second);
}

function afterColon(line) {
  var idx = line.indexOf(":");
  return idx >= 0 ? line.substring(idx + 1) : "";
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function padRight(s, width) {
  s = String(s || "");
  if (s.length >= width) return s;
  return s + new Array(width - s.length + 1).join(" ");
}

function jsonResponse(status, payload, callback) {
  var out = {
    ok: status >= 200 && status < 300,
    status: status,
    body: payload,
  };
  if (callback) {
    var body = callback + "(" + JSON.stringify(out) + ");";
    return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function getJsonpCallbackName(rawName) {
  var name = String(rawName || "").trim();
  if (!name) return "";
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(name)) return "";
  return name;
}
