import csv
from datetime import datetime, timedelta

# --- INSTÄLLNINGAR ---
INPUT_FILE = 'Tidrapport 202603.CSV'  # Namnet på din fil från Outlook
OUTPUT_FILE = 'toggl_ready_import.csv'
USER_NAME = 'Lars'
USER_EMAIL = 'din.mail@exempel.se' # Måste vara samma som i Toggl

def parse_time(time_str):
    """Hanterar både 24h '18:15:00' och 12h '6:15 PM'."""
    for fmt in ('%H:%M:%S', '%I:%M:%S %p', '%H:%M', '%I:%M %p'):
        try:
            return datetime.strptime(time_str, fmt).time()
        except ValueError:
            continue
    return None

def parse_date(date_str):
    """Hanterar '2026-3-25' eller '3/25/2026'."""
    for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%m/%d/%y'):
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    return None

def format_duration(seconds):
    hours, remainder = divmod(int(seconds), 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours:02}:{minutes:02}:{seconds:02}"

# --- KÖR KONVERTERING ---
with open(INPUT_FILE, mode='r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    
    with open(OUTPUT_FILE, mode='w', encoding='utf-8', newline='') as out_f:
        fieldnames = ['User', 'Email', 'Client', 'Project', 'Task', 'Description', 
                     'Billable', 'Start date', 'Start time', 'End date', 'End time', 'Duration']
        writer = csv.DictWriter(out_f, fieldnames=fieldnames)
        writer.writeheader()

        for row in reader:
            start_d = parse_date(row['Startdatum'])
            end_d = parse_date(row['Slutdatum'])
            start_t = parse_time(row['Starttid'])
            end_t = parse_time(row['Sluttid'])
            
            if not all([start_d, end_d, start_t, end_t]):
                continue
            
            # Beräkna varaktighet
            dt_start = datetime.combine(start_d, start_t)
            dt_end = datetime.combine(end_d, end_t)
            
            # Hantera om mötet går över midnatt
            if dt_end < dt_start:
                dt_end += timedelta(days=1)
                
            duration_str = format_duration((dt_end - dt_start).total_seconds())
            
            writer.writerow({
                'User': USER_NAME,
                'Email': USER_EMAIL,
                'Client': '',
                'Project': row['Ämne'],
                'Task': '',
                'Description': row.get('Beskrivning', '') or row['Ämne'],
                'Billable': 'Yes',
                'Start date': start_d.strftime('%Y-%m-%d'),
                'Start time': start_t.strftime('%H:%M:%S'),
                'End date': end_d.strftime('%Y-%m-%d'),
                'End time': end_t.strftime('%H:%M:%S'),
                'Duration': duration_str
            })

print(f"Klart! Filen '{OUTPUT_FILE}' har skapats och är redo för Toggl.")
