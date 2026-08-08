import os
import sys
import json
import requests
from datetime import datetime
from icalendar import Calendar
from dotenv import load_dotenv

load_dotenv()

def main():
    # Hämta URL från .env som standard
    source = os.getenv("KALENDER_TIDRAPPORT_URL")
    
    # Hantera argument: ics2tidrapport.py <yyyy-mm> [prefix]
    if len(sys.argv) < 2:
        print("Användning: python ics2tidrapport.py <yyyy-mm> [prefix]", file=sys.stderr)
        sys.exit(1)

    target_month = sys.argv[1] # t.ex. "2026-04"
    prefix = sys.argv[2] if len(sys.argv) > 2 else ""

    if not source:
        print("Fel: Ingen KALENDER_TIDRAPPORT_URL hittades i .env", file=sys.stderr)
        sys.exit(1)

    bearbetad_data_lista = []

    try:
        # Hämta kalenderdata (URL)
        response = requests.get(source)
        response.raise_for_status()
        cal = Calendar.from_ical(response.content)

        for component in cal.walk('vevent'):
            ämne = str(component.get('summary'))
            if not ämne or (prefix and not ämne.upper().startswith(prefix.upper())):
                continue

            dtstart = component.get('dtstart').dt
            dtend = component.get('dtend').dt
            if not isinstance(dtstart, datetime): continue

            start_month_str = dtstart.strftime('%Y-%m')
            if start_month_str != target_month:
                continue

            duration_decimal = round((dtend - dtstart).total_seconds() / 3600.0, 2)
            bearbetad_data_lista.append({
                'Ämne': ämne,
                'Startdatum': dtstart.strftime('%Y-%m-%d'),
                'Duration_decimal': duration_decimal
            })

        # --- SMART OUTPUT ---
        if sys.stdout.isatty():
            # Tabellvisning för manuell körning
            print(f"\n--- SAMMANSTÄLLNING FÖR {target_month} ---")
            total = 0
            for rad in sorted(bearbetad_data_lista, key=lambda x: x['Startdatum']):
                print(f"{rad['Startdatum']} | {rad['Duration_decimal']}h | {rad['Ämne']}")
                total += rad['Duration_decimal']
            print(f"Totalt: {total}h\n")
        else:
            # JSON-output för pipen till nästa script
            print(json.dumps(bearbetad_data_lista))

    except Exception as e:
        print(f"Ett fel uppstod: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
