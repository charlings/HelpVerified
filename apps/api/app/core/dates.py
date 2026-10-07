"""Calendar arithmetic that timedelta can't express."""

import calendar
from datetime import datetime


def add_months(moment: datetime, months: int) -> datetime:
    """Same day `months` later, clamped to the month's last day (31 Jan + 1 month → 28/29 Feb)."""
    month_index = moment.month - 1 + months
    year, month = moment.year + month_index // 12, month_index % 12 + 1
    day = min(moment.day, calendar.monthrange(year, month)[1])
    return moment.replace(year=year, month=month, day=day)
