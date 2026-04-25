import requests
import sys
from icalendar import Calendar
from datetime import datetime
import collections

def sammanstall_kalender(ics_url, year, month):
    try:
        # Använd headers för att se ut som en vanlig webbläsare om Google blockerar enkla requests
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = requests.get(ics_url, headers=headers)
        response.raise_for_status()
    except Exception as e:
        print(f"Fel vid hämtning av kalender: {e}")
        print("Tips: Kontrollera att du använder .ics-länken och att den är inom citationstecken.")
        sys.exit(1)

    gcal = Calendar.from_ical(response.content)
    
    # För den dagliga listan
    dagliga_aktiviteter = collections.defaultdict(lambda: collections.defaultdict(float))
    # För totalsummering per aktivitet
    total_per_aktivitet = collections.defaultdict(float)
    
    for component in gcal.walk():
        if component.name == "VEVENT":
            summary = str(component.get('summary'))
            dtstart = component.get('dtstart').dt
            dtend = component.get('dtend').dt
            
            # Kontrollera att det är en datetime (inte heldagshändelse)
            if isinstance(dtstart, datetime):
                if dtstart.year == year and dtstart.month == month:
                    duration = dtend - dtstart
                    timmar = duration.total_seconds() / 3600
                    datum_str = dtstart.strftime('%Y-%m-%d')
                    
                    dagliga_aktiviteter[datum_str][summary] += timmar
                    total_per_aktivitet[summary] += timmar
            
    # 1. Skriv ut den dagliga listan (underlag för specifikation)
    print(f"\nDAGLIG SPECIFIKATION: {year}-{month:02d}")
    print(f"{'Datum':<12} {'Timmar':<10} {'Projekt'}")
    print("-" * 45)
    
    for datum in sorted(dagliga_aktiviteter.keys()):
        for aktivitet, timmar in dagliga_aktiviteter[datum].items():
            timmar_format = f"{round(timmar, 2):g}".replace('.', ',')
            print(f"{datum:<12} {timmar_format + 'h':<10} {aktivitet}")

    # 2. Skriv ut sammanställning per aktivitet (underlag för fakturarader)
    print(f"\nSAMMANSTÄLLNING PER AKTIVITET:")
    print(f"{'Projekt':<23} {'Total tid'}")
    print("-" * 45)
    
    total_manad = 0
    for aktivitet in sorted(total_per_aktivitet.keys()):
        timmar = total_per_aktivitet[aktivitet]
        total_manad += timmar
        timmar_format = f"{round(timmar, 2):g}".replace('.', ',')
        print(f"{aktivitet:<23} {timmar_format}h")
    
    print("-" * 45)
    print(f"{'TOTALT APRIL:':<23} {f'{round(total_manad, 2):g}'.replace('.', ',')}h\n")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Användning: python ics2tidrapport.py \"<URL>\" <ÅR> <MÅNAD>")
    else:
        try:
            url_arg = sys.argv[1]
            year_arg = int(sys.argv[2])
            month_arg = int(sys.argv[3])
            sammanstall_kalender(url_arg, year_arg, month_arg)
        except ValueError:
            print("Fel: År och månad måste vara siffror.")
