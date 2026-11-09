/**
 * Google Apps Script: weekly flexbank report by e-mail.
 *
 * Reads the same ICS calendar as the tidrapport (Script Property KALENDER_TIDRAPPORT_URL),
 * counts worked time from events whose subject is the project prefix or starts with the
 * prefix followed by a space (Script Property FLEX_PROJEKT_PREFIX), compares it with the
 * normal working time for a full-time employee
 * and e-mails the running flex balance every Monday.
 *
 * Entry points (run from the Apps Script editor):
 * - installWeeklyTrigger()    creates the Monday time trigger (run once).
 * - sendFlexReportNow()       sends the report for the last full week right away.
 * - sendWeeklyFlexReport()    called by the trigger: report for the previous week (mon-sun).
 *
 * Script Properties:
 * - KALENDER_TIDRAPPORT_URL   (required) ICS calendar URL.
 * - FLEX_PROJEKT_PREFIX       (required) subject prefix of the events that count as work.
 * - FLEX_RAPPORT_MOTTAGARE    recipients separated by ";", defaults to the script owner's address.
 * - FLEX_STARTDATUM           yyyy-mm-dd, defaults to STANDARD_STARTDATUM.
 * - FLEX_INGAENDE_SALDO       opening balance in hours (e.g. "0", "-1.5"), defaults to 0.
 * - FLEX_VERKSAMHET           built-in rule set in VERKSAMHETER, defaults to "trafikverket".
 * - FLEX_REGLER               own rules as JSON, same shape as a VERKSAMHETER entry. Fields
 *                             left out are taken from the FLEX_VERKSAMHET rule set.
 */

var TIDSZON = "Europe/Stockholm";
var STANDARD_STARTDATUM = "2026-05-15";

// Working-time rules per organisation (verksamhet).
// - normtidTimmar:   normal hours per weekday for full time.
// - fridagar:        weekdays that are days off (normal time 0).
// - forkortadeDagar: days whose normal time is shortened by `timmar`, optionally only
//                    when the day falls on one of `veckodagar` (mån, tis, ons, tor, fre).
// - nationaldagKompensation: when the national day falls on a weekend it is compensated
//                    with one day off. Mark that day in the calendar with an all-day event
//                    containing "nationaldag"; it then gets normal time 0.
// - forkortadeDagarGiltigTill: last day (yyyy-mm-dd) the shortened days are known to apply.
//                    The mail warns from one month before that day until the rules are updated.
// Days are given by name (see namedDays) or as "MM-DD", e.g. "12-23".
var STANDARD_VERKSAMHET = "trafikverket";
var VERKSAMHETER = {
  trafikverket: {
    namn: "Trafikverket",
    normtidTimmar: 8,
    fridagar: [
      "nyårsdagen",
      "trettondedag jul",
      "långfredagen",
      "annandag påsk",
      "första maj",
      "kristi himmelsfärdsdag",
      "nationaldagen",
      "midsommarafton",
      "julafton",
      "juldagen",
      "annandag jul",
      "nyårsafton",
    ],
    // Förkortade arbetsdagar enligt flextidsreglerna. De räknas alltid in i normtiden.
    // Trafikverkets tabell anger datum för 2026 och 2027.
    forkortadeDagarGiltigTill: "2027-12-31",
    forkortadeDagar: [
      { dag: "trettondagsafton", timmar: 4 },
      { dag: "skärtorsdagen", timmar: 2 },
      { dag: "valborgsmässoafton", veckodagar: ["mån", "tis", "ons", "tor"], timmar: 2 },
      { dag: "valborgsmässoafton", veckodagar: ["fre"], timmar: 4 },
      { dag: "allhelgonaafton", timmar: 4 },
      { dag: "12-23", veckodagar: ["fre"], timmar: 4 },
    ],
    // Affärsverksavtalet 15 § 1.3: nationaldag på helg ger en ledig arbetsdag vid heltid.
    nationaldagKompensation: true,
  },
};

// All-day events starting with one of these words make the day's normal time 0.
// Timed events with these words count as time worked (e.g. a sick afternoon).
// Flex leave should NOT be listed here: a flex day off is meant to reduce the balance.
var FRANVARO_ORD = ["Semester", "Sjuk", "VAB", "Föräldraledig", "Tjänstledig", "Kompledig"];

var VECKODAGAR = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];

var MANADSNAMN = [
  "januari",
  "februari",
  "mars",
  "april",
  "maj",
  "juni",
  "juli",
  "augusti",
  "september",
  "oktober",
  "november",
  "december",
];

function installWeeklyTrigger() {
  // Also removes the trigger from the earlier monthly version of this script.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var handler = t.getHandlerFunction();
    if (handler === "sendWeeklyFlexReport" || handler === "sendMonthlyFlexReport") {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger("sendWeeklyFlexReport")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(6)
    .inTimezone(TIDSZON)
    .create();
  Logger.log("Veckotrigger installerad: varje måndag ca kl 06.");
}

function sendWeeklyFlexReport() {
  var today = todayKey();
  var weekday = dayKeyToUtc(today).getUTCDay();
  var periodTo = addDays(today, -(weekday === 0 ? 7 : weekday)); // previous Sunday
  return sendFlexReport(addDays(periodTo, -6), periodTo);
}

function sendFlexReportNow() {
  return sendWeeklyFlexReport();
}

function sendFlexReport(periodFrom, periodTo) {
  var config = getConfig();
  if (periodTo < config.startKey) {
    Logger.log("Perioden slutar före startdatum " + config.startKey + ", inget mail skickas.");
    return null;
  }
  if (periodFrom < config.startKey) periodFrom = config.startKey;

  var icsResponse = UrlFetchApp.fetch(config.calendarUrl, { muteHttpExceptions: true });
  if (icsResponse.getResponseCode() >= 400) {
    throw new Error("Calendar fetch failed: HTTP " + icsResponse.getResponseCode());
  }

  var events = extractEvents(icsResponse.getContentText());
  var flex = computeFlexDays(events, config, periodTo);
  var report = buildReport(flex, periodFrom, periodTo, config);

  MailApp.sendEmail({
    to: config.recipient,
    subject: report.subject,
    body: report.text,
    htmlBody: report.html,
  });
  Logger.log("Skickat till " + config.recipient + ": " + report.subject + "\n\n" + report.text);
  return report.subject;
}

function getConfig() {
  var props = PropertiesService.getScriptProperties().getProperties();
  var calendarUrl = String(props.KALENDER_TIDRAPPORT_URL || "").trim();
  if (!calendarUrl) throw new Error("Missing Script Property KALENDER_TIDRAPPORT_URL.");

  var prefix = String(props.FLEX_PROJEKT_PREFIX || "").trim();
  if (!prefix) throw new Error("Missing Script Property FLEX_PROJEKT_PREFIX.");

  var startKey = String(props.FLEX_STARTDATUM || STANDARD_STARTDATUM).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startKey)) throw new Error("FLEX_STARTDATUM must be yyyy-mm-dd.");

  var opening = Number(String(props.FLEX_INGAENDE_SALDO || "0").replace(",", "."));
  if (isNaN(opening)) throw new Error("FLEX_INGAENDE_SALDO must be a number of hours.");

  var rules = getRules(props.FLEX_VERKSAMHET, props.FLEX_REGLER);

  return {
    calendarUrl: calendarUrl,
    prefix: prefix,
    recipient: parseRecipients(props.FLEX_RAPPORT_MOTTAGARE) || Session.getEffectiveUser().getEmail(),
    startKey: startKey,
    openingMinutes: Math.round(opening * 60),
    rules: rules,
  };
}

function getRules(verksamhet, customJson) {
  var key = String(verksamhet || STANDARD_VERKSAMHET).trim().toLowerCase();
  var base = VERKSAMHETER[key];
  if (!base) {
    throw new Error(
      "Unknown FLEX_VERKSAMHET \"" + key + "\". Use one of: " + Object.keys(VERKSAMHETER).join(", ") + "."
    );
  }

  var custom = {};
  if (String(customJson || "").trim()) {
    try {
      custom = JSON.parse(customJson);
    } catch (err) {
      throw new Error("FLEX_REGLER is not valid JSON: " + err.message);
    }
  }

  var rules = {
    namn: custom.namn || base.namn,
    normtidTimmar: custom.normtidTimmar != null ? Number(custom.normtidTimmar) : base.normtidTimmar,
    fridagar: custom.fridagar || base.fridagar,
    forkortadeDagar: custom.forkortadeDagar || base.forkortadeDagar,
    // Own shortened days without a validity date never expire.
    forkortadeDagarGiltigTill:
      custom.forkortadeDagarGiltigTill ||
      (custom.forkortadeDagar ? "" : base.forkortadeDagarGiltigTill || ""),
    nationaldagKompensation:
      custom.nationaldagKompensation != null
        ? !!custom.nationaldagKompensation
        : !!base.nationaldagKompensation,
  };
  if (!(rules.normtidTimmar > 0)) throw new Error("normtidTimmar must be a positive number.");
  if (rules.forkortadeDagarGiltigTill && !/^\d{4}-\d{2}-\d{2}$/.test(rules.forkortadeDagarGiltigTill)) {
    throw new Error("forkortadeDagarGiltigTill must be yyyy-mm-dd.");
  }
  resolveRuleDays(rules, 2026); // throws on unknown day names or weekdays
  return rules;
}

// "a@x.se; b@y.se" -> "a@x.se,b@y.se" (MailApp expects comma-separated addresses).
function parseRecipients(value) {
  return String(value || "")
    .split(/[;,]/)
    .map(function (s) {
      return s.trim();
    })
    .filter(function (s) {
      return s;
    })
    .join(",");
}

// ---------------------------------------------------------------------------
// Calendar parsing

function extractEvents(icsText) {
  var lines = unfoldIcsLines(icsText || "");
  var events = [];
  var current = null;
  var nested = 0; // e.g. VALARM inside VEVENT

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line === "BEGIN:VEVENT") {
      current = {};
      nested = 0;
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    if (line.indexOf("BEGIN:") === 0) {
      nested++;
      continue;
    }
    if (line.indexOf("END:") === 0) {
      if (nested > 0) nested--;
      continue;
    }
    if (nested > 0) continue;

    var name = line.split(/[;:]/)[0].toUpperCase();
    if (name === "SUMMARY") current.summary = unescapeIcsText(afterColon(line)).trim();
    else if (name === "DTSTART") current.dtstart = afterColon(line).trim();
    else if (name === "DTEND") current.dtend = afterColon(line).trim();
    else if (name === "STATUS") current.status = afterColon(line).trim().toUpperCase();
    else if (name === "RRULE") current.recurring = true;
  }
  return events;
}

function matchesProject(subject, prefix) {
  var escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var re = new RegExp("^" + escaped + "(?![0-9A-Za-zÅÄÖåäö])", "i");
  return re.test(String(subject || "").trim());
}

function matchesAbsence(subject) {
  var s = String(subject || "").trim().toLowerCase();
  return FRANVARO_ORD.some(function (word) {
    return s.indexOf(word.toLowerCase()) === 0;
  });
}

// ---------------------------------------------------------------------------
// Flex calculation (all amounts in minutes)

function computeFlexDays(events, config, endKey) {
  var startKey = config.startKey;
  var openingMinutes = config.openingMinutes;
  var intervalsByDay = {};
  var absenceDays = {};
  var nationalDayMarks = [];
  var areaMinutes = {}; // subject -> { day: minutes }, summed like the tidrapport
  var recurringCount = 0;

  events.forEach(function (ev) {
    if (ev.status === "CANCELLED") return;
    var isWork = matchesProject(ev.summary, config.prefix);
    var allDayStart = parseIcsDate(ev.dtstart);
    if (!isWork && allDayStart && /nationaldag/i.test(ev.summary || "")) {
      nationalDayMarks.push(allDayStart);
      return;
    }
    var isAbsence = !isWork && matchesAbsence(ev.summary);
    if (!isWork && !isAbsence) return;

    if (allDayStart) {
      if (!isAbsence) return;
      var allDayEnd = parseIcsDate(ev.dtend) || addDays(allDayStart, 1);
      for (var d = allDayStart; d < allDayEnd; d = addDays(d, 1)) absenceDays[d] = ev.summary;
      return;
    }

    var start = parseIcsDateTime(ev.dtstart);
    var end = parseIcsDateTime(ev.dtend);
    if (!start || !end || end <= start) return;
    var key = formatDayKey(start);
    if (key < startKey || key > endKey) return;
    if (ev.recurring && isWork) recurringCount++;
    if (!intervalsByDay[key]) intervalsByDay[key] = [];
    intervalsByDay[key].push([start.getTime(), end.getTime()]);
    if (isWork) {
      var area = String(ev.summary).trim();
      if (!areaMinutes[area]) areaMinutes[area] = {};
      areaMinutes[area][key] = (areaMinutes[area][key] || 0) + Math.round((end - start) / 60000);
    }
  });

  var warnings = [];
  var expiryWarning = rulesExpiryWarning(config.rules, endKey);
  if (expiryWarning) warnings.push(expiryWarning);
  if (config.rules.nationaldagKompensation) {
    applyNationalDayCompensation(nationalDayMarks, absenceDays, config.rules, startKey, endKey, warnings);
  }

  var holidayCache = {};
  var days = [];
  var saldo = openingMinutes || 0;
  for (var day = startKey; day <= endKey; day = addDays(day, 1)) {
    var norm = dayNorm(day, absenceDays, config.rules, holidayCache);
    var worked = mergedMinutes(intervalsByDay[day]);
    var flex = worked - norm.minutes;
    saldo += flex;
    days.push({
      date: day,
      worked: worked,
      norm: norm.minutes,
      flex: flex,
      saldo: saldo,
      note: norm.note,
    });
  }

  return {
    days: days,
    openingMinutes: openingMinutes || 0,
    recurringCount: recurringCount,
    warnings: warnings,
    areaMinutes: areaMinutes,
  };
}

// Warns from one month before the shortened days' validity date, and after it has passed.
function rulesExpiryWarning(rules, todayKey) {
  var validTo = rules.forkortadeDagarGiltigTill;
  if (!validTo) return "";
  if (todayKey > validTo) {
    return (
      "Reglerna för förkortade arbetsdagar för " +
      rules.namn +
      " gällde t.o.m. " +
      validTo +
      ". De gamla reglerna används tills vidare. Uppdatera forkortadeDagar och " +
      "forkortadeDagarGiltigTill i Code.gs (eller FLEX_REGLER)."
    );
  }
  if (todayKey >= addMonths(validTo, -1)) {
    return (
      "Reglerna för förkortade arbetsdagar för " +
      rules.namn +
      " gäller t.o.m. " +
      validTo +
      ". Kontrollera nästa års förkortade dagar och uppdatera forkortadeDagar och " +
      "forkortadeDagarGiltigTill i Code.gs (eller FLEX_REGLER)."
    );
  }
  return "";
}

// The national day on a Saturday or Sunday is compensated with one day off per year: the
// first weekday on or after 6 June that is marked with an all-day "nationaldag" event.
function applyNationalDayCompensation(marks, absenceDays, rules, startKey, endKey, warnings) {
  marks.sort();
  for (var year = Number(startKey.substring(0, 4)); year <= Number(endKey.substring(0, 4)); year++) {
    var nationalDay = year + "-06-06";
    var weekday = dayKeyToUtc(nationalDay).getUTCDay();
    if (weekday !== 0 && weekday !== 6) continue;

    var compDay = null;
    for (var i = 0; i < marks.length && !compDay; i++) {
      var w = dayKeyToUtc(marks[i]).getUTCDay();
      if (marks[i] >= nationalDay && marks[i].substring(0, 4) === String(year) && w !== 0 && w !== 6) {
        compDay = marks[i];
      }
    }
    if (compDay) {
      absenceDays[compDay] = "Kompensation för nationaldagen";
    } else if (endKey >= nationalDay && startKey <= nationalDay) {
      warnings.push(
        "Nationaldagen " +
          year +
          " föll på en " +
          (weekday === 6 ? "lördag" : "söndag") +
          " och kompenseras med en ledig dag. Lägg in dagen ni kommit överens om som heldagspost " +
          'med "Nationaldagen" i ämnet, så räknas den med normtid 0.'
      );
    }
  }
}

// Overlapping events on the same day are only counted once.
function mergedMinutes(intervals) {
  if (!intervals || !intervals.length) return 0;
  var sorted = intervals.slice().sort(function (a, b) {
    return a[0] - b[0];
  });
  var total = 0;
  var curStart = sorted[0][0];
  var curEnd = sorted[0][1];
  for (var i = 1; i < sorted.length; i++) {
    if (sorted[i][0] <= curEnd) {
      curEnd = Math.max(curEnd, sorted[i][1]);
    } else {
      total += curEnd - curStart;
      curStart = sorted[i][0];
      curEnd = sorted[i][1];
    }
  }
  total += curEnd - curStart;
  return Math.round(total / 60000);
}

function dayNorm(key, absenceDays, rules, holidayCache) {
  var year = Number(key.substring(0, 4));
  if (!holidayCache[year]) holidayCache[year] = resolveRuleDays(rules, year);
  var ruleDays = holidayCache[year];

  var weekday = dayKeyToUtc(key).getUTCDay();
  if (weekday === 0 || weekday === 6) return { minutes: 0, note: "" };
  if (ruleDays.fria[key]) return { minutes: 0, note: ruleDays.fria[key] };
  if (absenceDays[key]) return { minutes: 0, note: absenceDays[key] };

  var full = Math.round(rules.normtidTimmar * 60);
  var shortened = ruleDays.forkortade[key];
  if (shortened) {
    return {
      minutes: Math.max(0, full - shortened.minutes),
      note: shortened.label + " (förkortad " + formatHours(shortened.minutes) + ")",
    };
  }
  return { minutes: full, note: "" };
}

// Applies a rule set to one year: { fria: {key: label}, forkortade: {key: {label, minutes}} }.
function resolveRuleDays(rules, year) {
  var named = namedDays(year);
  var fria = {};
  var forkortade = {};

  rules.fridagar.forEach(function (name) {
    var day = resolveDay(name, year, named);
    fria[day.key] = day.label;
  });

  rules.forkortadeDagar.forEach(function (rule) {
    var day = resolveDay(rule.dag, year, named);
    var minutes = Math.round(Number(rule.timmar) * 60);
    if (!(minutes > 0)) throw new Error("forkortadeDagar: timmar must be positive for " + rule.dag + ".");
    if (rule.veckodagar) {
      var allowed = rule.veckodagar.map(function (w) {
        var idx = VECKODAGAR.indexOf(String(w).trim().toLowerCase().substring(0, 3));
        if (idx < 0) throw new Error("forkortadeDagar: unknown veckodag \"" + w + "\".");
        return idx;
      });
      if (allowed.indexOf(dayKeyToUtc(day.key).getUTCDay()) < 0) return;
    }
    var current = forkortade[day.key];
    if (!current || minutes > current.minutes) forkortade[day.key] = { label: day.label, minutes: minutes };
  });

  return { fria: fria, forkortade: forkortade };
}

function resolveDay(name, year, named) {
  var n = String(name || "").trim().toLowerCase();
  if (named[n]) return named[n];
  var m = n.match(/^(\d{2})-(\d{2})$/);
  if (m) return { key: year + "-" + n, label: Number(m[2]) + " " + MANADSNAMN[Number(m[1]) - 1] };
  throw new Error(
    "Unknown day \"" + name + "\". Use \"MM-DD\" or one of: " + Object.keys(named).join(", ") + "."
  );
}

// Swedish holidays and eves that rules can refer to by name.
function namedDays(year) {
  var easter = easterSunday(year);
  var y = String(year);
  var allSaints = firstWeekdayOnOrAfter(y + "-10-31", 6);
  var midsummerEve = firstWeekdayOnOrAfter(y + "-06-19", 5);
  var list = [
    ["nyårsdagen", "Nyårsdagen", y + "-01-01"],
    ["trettondagsafton", "Trettondagsafton", y + "-01-05"],
    ["trettondedag jul", "Trettondedag jul", y + "-01-06"],
    ["skärtorsdagen", "Skärtorsdagen", addDays(easter, -3)],
    ["långfredagen", "Långfredagen", addDays(easter, -2)],
    ["påskafton", "Påskafton", addDays(easter, -1)],
    ["annandag påsk", "Annandag påsk", addDays(easter, 1)],
    ["valborgsmässoafton", "Valborgsmässoafton", y + "-04-30"],
    ["första maj", "Första maj", y + "-05-01"],
    ["dagen före kristi himmelsfärdsdag", "Dagen före Kristi himmelsfärdsdag", addDays(easter, 38)],
    ["kristi himmelsfärdsdag", "Kristi himmelsfärdsdag", addDays(easter, 39)],
    ["dagen före nationaldagen", "Dagen före nationaldagen", y + "-06-05"],
    ["nationaldagen", "Sveriges nationaldag", y + "-06-06"],
    ["midsommarafton", "Midsommarafton", midsummerEve],
    ["allhelgonaafton", "Allhelgonaafton", addDays(allSaints, -1)],
    ["alla helgons dag", "Alla helgons dag", allSaints],
    ["julafton", "Julafton", y + "-12-24"],
    ["juldagen", "Juldagen", y + "-12-25"],
    ["annandag jul", "Annandag jul", y + "-12-26"],
    ["nyårsafton", "Nyårsafton", y + "-12-31"],
  ];
  var out = {};
  list.forEach(function (d) {
    out[d[0]] = { label: d[1], key: d[2] };
  });
  return out;
}

function easterSunday(year) {
  var a = year % 19;
  var b = Math.floor(year / 100);
  var c = year % 100;
  var d = Math.floor(b / 4);
  var e = b % 4;
  var f = Math.floor((b + 8) / 25);
  var g = Math.floor((b - f + 1) / 3);
  var h = (19 * a + b - d - g + 15) % 30;
  var i = Math.floor(c / 4);
  var k = c % 4;
  var l = (32 + 2 * e + 2 * i - h - k) % 7;
  var m = Math.floor((a + 11 * h + 22 * l) / 451);
  var month = Math.floor((h + l - 7 * m + 114) / 31);
  var day = ((h + l - 7 * m + 114) % 31) + 1;
  return year + "-" + pad2(month) + "-" + pad2(day);
}

function firstWeekdayOnOrAfter(key, weekday) {
  while (dayKeyToUtc(key).getUTCDay() !== weekday) key = addDays(key, 1);
  return key;
}

// ---------------------------------------------------------------------------
// Report

function buildReport(flex, periodFrom, periodTo, config) {
  var all = flex.days;
  var inPeriod = all.filter(function (d) {
    return d.date >= periodFrom && d.date <= periodTo;
  });
  var closing = all.length ? all[all.length - 1].saldo : flex.openingMinutes;
  var week = isoWeek(periodTo);
  var periodLabel = "vecka " + week.week + " (" + week.year + ")";
  var periodSum = sumDays(inPeriod);

  // Weekends are only listed if something was worked.
  var dayRows = inPeriod.filter(function (d) {
    return d.norm > 0 || d.worked > 0 || d.note;
  }).map(function (d) {
    return {
      label: VECKODAGAR[dayKeyToUtc(d.date).getUTCDay()] + " " + d.date,
      sum: { worked: d.worked, norm: d.norm, flex: d.flex },
      lastSaldo: d.saldo,
    };
  });
  var months = groupBy(all, function (d) {
    return MANADSNAMN[Number(d.date.substring(5, 7)) - 1] + " " + d.date.substring(0, 4);
  });
  var specialDays = inPeriod.filter(function (d) {
    return d.note;
  });
  var areas = buildAreaTable(flex.areaMinutes || {}, inPeriod);

  var subject = "Flexbank " + config.prefix + " " + periodLabel + ": " + formatFlex(closing);
  var warnings = (flex.warnings || []).slice();
  if (flex.recurringCount > 0) {
    warnings.push(
      flex.recurringCount +
        " återkommande " +
        config.prefix +
        "-händelse(r) hittades. Bara första tillfället räknas, så saldot kan vara för lågt."
    );
  }

  var text = [];
  text.push("Flexsaldo " + formatFlex(closing) + " (t.o.m. " + periodTo + ")");
  text.push("Flex beräknas för prefix: " + config.prefix);
  text.push("");
  text.push("Period " + periodFrom + " – " + periodTo + " (" + periodLabel + ")");
  text.push("  Arbetat:  " + formatHours(periodSum.worked));
  text.push("  Normtid:  " + formatHours(periodSum.norm));
  text.push("  Flex:     " + formatFlex(periodSum.flex));
  text.push("");
  text.push("Per dag");
  dayRows.forEach(function (g) {
    text.push(
      "  " +
        padRight(g.label, 16) +
        padRight(formatHours(g.sum.worked), 9) +
        padRight(formatHours(g.sum.norm), 9) +
        padRight(formatFlex(g.sum.flex), 9) +
        "saldo " +
        formatFlex(g.lastSaldo)
    );
  });
  if (areas.rows.length) {
    text.push("");
    text.push("Tider per arbetsområde (timmar)");
    [[""].concat(areas.headers)].concat(areas.rows).forEach(function (r) {
      var cells = r.slice(1).map(function (v) {
        return padRight(v, 6);
      });
      text.push("  " + padRight(r[0], 20) + cells.join(""));
    });
  }
  if (specialDays.length) {
    text.push("");
    text.push("Särskilda dagar");
    specialDays.forEach(function (d) {
      text.push("  " + d.date + "  " + d.note + " (norm " + formatHours(d.norm) + ")");
    });
  }
  text.push("");
  text.push("Per månad sedan " + config.startKey + " (ingående saldo " + formatFlex(flex.openingMinutes) + ")");
  months.forEach(function (g) {
    text.push(
      "  " + padRight(g.label, 16) + padRight(formatFlex(g.sum.flex), 9) + "saldo " + formatFlex(g.lastSaldo)
    );
  });
  if (warnings.length) {
    text.push("");
    warnings.forEach(function (w) {
      text.push("OBS: " + w);
    });
  }
  text.push("");
  text.push(
    "Räknat på kalenderposter som börjar med \"" +
      config.prefix +
      "\", normtid " +
      config.rules.normtidTimmar +
      " h/vardag, regler för " +
      config.rules.namn +
      "."
  );

  var html = [];
  html.push('<div style="font-family:Arial,sans-serif;color:#1f2937;max-width:640px">');
  html.push(
    '<p style="font-size:14px;margin:0">Flexsaldo t.o.m. ' + escapeHtml(periodTo) + "</p>"
  );
  html.push(
    '<p style="font-size:32px;font-weight:bold;margin:4px 0 4px">' +
      escapeHtml(formatFlex(closing)) +
      "</p>"
  );
  html.push(
    '<p style="font-size:13px;color:#6b7280;margin:0 0 16px">Flex beräknas för prefix: <b>' +
      escapeHtml(config.prefix) +
      "</b></p>"
  );
  html.push(
    "<p>" +
      escapeHtml(periodLabel) +
      ": arbetat " +
      escapeHtml(formatHours(periodSum.worked)) +
      ", normtid " +
      escapeHtml(formatHours(periodSum.norm)) +
      ", flex <b>" +
      escapeHtml(formatFlex(periodSum.flex)) +
      "</b></p>"
  );
  html.push(
    htmlTable(
      ["Dag", "Arbetat", "Normtid", "Flex", "Saldo"],
      dayRows.map(function (g) {
        return [
          g.label,
          formatHours(g.sum.worked),
          formatHours(g.sum.norm),
          formatFlex(g.sum.flex),
          formatFlex(g.lastSaldo),
        ];
      })
    )
  );
  if (areas.rows.length) {
    html.push('<h3 style="font-size:15px;margin:20px 0 6px">Tider per arbetsområde (timmar)</h3>');
    html.push(htmlTable(["Arbetsområde"].concat(areas.headers), areas.rows));
  }
  if (specialDays.length) {
    html.push('<h3 style="font-size:15px;margin:20px 0 6px">Särskilda dagar</h3>');
    html.push(
      htmlTable(
        ["Datum", "", "Normtid"],
        specialDays.map(function (d) {
          return [d.date, d.note, formatHours(d.norm)];
        })
      )
    );
  }
  html.push(
    '<h3 style="font-size:15px;margin:20px 0 6px">Per månad sedan ' +
      escapeHtml(config.startKey) +
      "</h3>"
  );
  html.push(
    htmlTable(
      ["Månad", "Arbetat", "Normtid", "Flex", "Saldo"],
      months.map(function (g) {
        return [
          g.label,
          formatHours(g.sum.worked),
          formatHours(g.sum.norm),
          formatFlex(g.sum.flex),
          formatFlex(g.lastSaldo),
        ];
      })
    )
  );
  warnings.forEach(function (w) {
    html.push('<p style="color:#b45309"><b>OBS:</b> ' + escapeHtml(w) + "</p>");
  });
  html.push(
    '<p style="font-size:12px;color:#6b7280">Ingående saldo ' +
      escapeHtml(formatFlex(flex.openingMinutes)) +
      ". Räknat på kalenderposter som börjar med &quot;" +
      escapeHtml(config.prefix) +
      "&quot;, normtid " +
      config.rules.normtidTimmar +
      " h/vardag, regler för " +
      escapeHtml(config.rules.namn) +
      ".</p>"
  );
  html.push("</div>");

  return { subject: subject, text: text.join("\n"), html: html.join("\n") };
}

// Rows of [subject, hours per weekday..., total] for the period, Mon-Fri like the tidrapport.
// Saturday and Sunday are only added as columns if any hours were reported on them.
function buildAreaTable(areaMinutes, periodDays) {
  var subjects = Object.keys(areaMinutes)
    .filter(function (a) {
      return periodDays.some(function (d) {
        return areaMinutes[a][d.date];
      });
    })
    .sort();
  var columns = periodDays.filter(function (d) {
    var weekday = dayKeyToUtc(d.date).getUTCDay();
    if (weekday !== 0 && weekday !== 6) return true;
    return subjects.some(function (a) {
      return areaMinutes[a][d.date];
    });
  });

  var headers = columns.map(function (d) {
    return VECKODAGAR[dayKeyToUtc(d.date).getUTCDay()];
  });
  headers.push("Summa");
  var rows = subjects.map(function (a) {
    var total = 0;
    var row = [a];
    columns.forEach(function (d) {
      var minutes = areaMinutes[a][d.date] || 0;
      total += minutes;
      row.push(formatDecimalHours(minutes));
    });
    row.push(formatDecimalHours(total));
    return row;
  });
  return { headers: headers, rows: rows };
}

function formatDecimalHours(minutes) {
  return String(Math.round((minutes / 60) * 100) / 100);
}

function sumDays(days) {
  return days.reduce(
    function (acc, d) {
      acc.worked += d.worked;
      acc.norm += d.norm;
      acc.flex += d.flex;
      return acc;
    },
    { worked: 0, norm: 0, flex: 0 }
  );
}

function groupBy(days, labelFn) {
  var groups = [];
  days.forEach(function (d) {
    var label = labelFn(d);
    var last = groups[groups.length - 1];
    if (!last || last.label !== label) {
      last = { label: label, days: [] };
      groups.push(last);
    }
    last.days.push(d);
  });
  return groups.map(function (g) {
    return { label: g.label, sum: sumDays(g.days), lastSaldo: g.days[g.days.length - 1].saldo };
  });
}

function htmlTable(headers, rows) {
  var cell = "padding:4px 10px;border-bottom:1px solid #e5e7eb;";
  var out = ['<table style="border-collapse:collapse;font-size:14px">', "<tr>"];
  headers.forEach(function (h, i) {
    out.push(
      '<th style="' + cell + "text-align:" + (i === 0 ? "left" : "right") + ';background:#eef2ff">' +
        escapeHtml(h) +
        "</th>"
    );
  });
  out.push("</tr>");
  rows.forEach(function (r) {
    out.push("<tr>");
    r.forEach(function (v, i) {
      out.push(
        '<td style="' + cell + "text-align:" + (i === 0 ? "left" : "right") + '">' + escapeHtml(v) + "</td>"
      );
    });
    out.push("</tr>");
  });
  out.push("</table>");
  return out.join("");
}

function formatHours(minutes) {
  var abs = Math.abs(minutes);
  return (minutes < 0 ? "-" : "") + Math.floor(abs / 60) + ":" + pad2(abs % 60);
}

function formatFlex(minutes) {
  return (minutes > 0 ? "+" : "") + formatHours(minutes);
}

// ---------------------------------------------------------------------------
// Date helpers. Days are handled as "yyyy-MM-dd" keys in Swedish local time.

function todayKey() {
  return Utilities.formatDate(new Date(), TIDSZON, "yyyy-MM-dd");
}

function formatDayKey(date) {
  return Utilities.formatDate(date, TIDSZON, "yyyy-MM-dd");
}

function parseIcsDate(value) {
  var m = String(value || "").match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? m[1] + "-" + m[2] + "-" + m[3] : null;
}

function parseIcsDateTime(value) {
  var m = String(value || "").match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  if (m[7]) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  }
  // Floating and TZID times are interpreted as Swedish local time.
  return Utilities.parseDate(m[1] + m[2] + m[3] + m[4] + m[5] + m[6], TIDSZON, "yyyyMMddHHmmss");
}

function dayKeyToUtc(key) {
  var p = key.split("-");
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
}

// Same day n months away, clamped to the month's last day (e.g. 03-31 -> 02-28).
function addMonths(key, n) {
  var p = key.split("-");
  var first = new Date(Date.UTC(+p[0], +p[1] - 1 + n, 1));
  var lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return (
    first.getUTCFullYear() + "-" + pad2(first.getUTCMonth() + 1) + "-" + pad2(Math.min(+p[2], lastDay))
  );
}

function addDays(key, n) {
  var d = dayKeyToUtc(key);
  d.setUTCDate(d.getUTCDate() + n);
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}

function isoWeek(key) {
  var d = dayKeyToUtc(key);
  var weekday = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - weekday);
  var yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return { year: d.getUTCFullYear(), week: Math.ceil(((d - yearStart) / 86400000 + 1) / 7) };
}

// ---------------------------------------------------------------------------
// Small helpers

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

function unescapeIcsText(s) {
  return String(s || "").replace(/\\([,;\\nN])/g, function (_m, c) {
    return c === "n" || c === "N" ? " " : c;
  });
}

function afterColon(line) {
  var idx = line.indexOf(":");
  return idx >= 0 ? line.substring(idx + 1) : "";
}

function pad2(n) {
  return (n < 10 ? "0" : "") + n;
}

function padRight(s, width) {
  s = String(s || "");
  if (s.length >= width) return s;
  return s + new Array(width - s.length + 1).join(" ");
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
