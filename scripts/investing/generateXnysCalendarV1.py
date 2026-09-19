import hashlib
import json
from pathlib import Path

import exchange_calendars
import pandas_market_calendars


START = "1980-01-01"
END = "2026-09-18"
FIRST_SESSION = "1980-01-02"
OUT = Path("lib/investing/research/calendars/XNYS_TRADING_CALENDAR_V1.json")


def iso_dates(values):
    return [str(value.date() if hasattr(value, "date") else value) for value in values]


def main():
    exchange_calendar = exchange_calendars.get_calendar("XNYS", start=START, end=END)
    exchange_sessions = iso_dates(exchange_calendar.sessions)

    market_calendar = pandas_market_calendars.get_calendar("XNYS")
    market_schedule = market_calendar.schedule(start_date=START, end_date=END)
    market_sessions = [str(index.date()) for index in market_schedule.index]

    if exchange_sessions != market_sessions:
        raise SystemExit("XNYS calendar sources disagree")

    joined = "\n".join(exchange_sessions) + "\n"
    session_list_sha256 = hashlib.sha256(joined.encode("utf-8")).hexdigest().upper()
    artifact = {
        "schemaVersion": "XNYS_TRADING_CALENDAR_V1",
        "calendar": "XNYS_TRADING_CALENDAR_V1",
        "coverageStart": START,
        "coverageEnd": END,
        "sessionCount": str(len(exchange_sessions)),
        "sessionListSha256": session_list_sha256,
        "sessions": exchange_sessions,
        "provenance": {
            "exchange_calendars": exchange_calendars.__version__,
            "pandas_market_calendars": pandas_market_calendars.__version__,
            "generationCommand": "python scripts/investing/generateXnysCalendarV1.py",
            "generationDate": "2026-09-19",
            "crossCheck": "MATCH",
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(artifact, sort_keys=True, separators=(",", ":")) + "\n"
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(len(exchange_sessions))
    print(session_list_sha256)
    print(hashlib.sha256(text.encode("utf-8")).hexdigest().upper())


if __name__ == "__main__":
    main()
