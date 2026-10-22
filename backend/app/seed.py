"""Fill the database with realistic FAKE data for the demo.

    python -m app.seed

Creates ~800 units in Calgary and Edmonton, 12 months of finished turnovers
(the "before" picture: mostly manual, slow process) and ~55 turnovers in
progress right now, some of them stuck. Everything is relative to today's
date, so the data always looks current. All people and addresses are fake.
"""

import calendar
import random
from datetime import date, datetime, time, timedelta

from faker import Faker
from sqlalchemy import text

from .db import SessionLocal
from .models import (
    AppMeta, Application, Lead, Lease, Listing, Owner, Property, StageEvent, Task, Tenant,
    Turnover, Unit, Vendor,
)
from .services.common import today as alberta_today
from .stages import STAGE_INFO, Stage

SEED = 42
TODAY = alberta_today()
random.seed(SEED)
fake = Faker("en_CA")
Faker.seed(SEED)

TARGET_UNITS = {"Calgary": 520, "Edmonton": 280}

# Neighbourhood -> (rent multiplier, address quadrant/suffix)
NEIGHBOURHOODS = {
    "Calgary": {
        "Beltline": (1.10, "SW"), "Mission": (1.12, "SW"), "Hillhurst": (1.10, "NW"),
        "Kensington": (1.08, "NW"), "Bridgeland": (1.06, "NE"), "Inglewood": (1.05, "SE"),
        "Crescent Heights": (1.02, "NW"), "Sunnyside": (1.04, "NW"), "Marda Loop": (1.08, "SW"),
        "Tuscany": (0.95, "NW"), "Mahogany": (0.97, "SE"), "Seton": (0.94, "SE"),
        "Varsity": (1.00, "NW"), "Bowness": (0.93, "NW"), "Sage Hill": (0.92, "NW"),
    },
    "Edmonton": {
        "Oliver": (1.08, "NW"), "Downtown": (1.06, "NW"), "Garneau": (1.07, "NW"),
        "Ritchie": (1.00, "NW"), "Strathcona": (1.05, "NW"), "Westmount": (1.02, "NW"),
        "Windermere": (0.97, "SW"), "Terwillegar": (0.95, "NW"), "Glenora": (1.04, "NW"),
        "Bonnie Doon": (0.98, "NW"), "Summerside": (0.93, "SW"),
    },
}

# Base market rent by city and bedrooms (2026 averages, rounded).
BASE_RENT = {
    "Calgary": {0: 1250, 1: 1465, 2: 1850, 3: 2300},
    "Edmonton": {0: 1050, 1: 1250, 2: 1550, 3: 1950},
}
SQFT = {0: (380, 520), 1: (520, 720), 2: (780, 1050), 3: (1100, 1500)}

AMENITIES = ["In-suite laundry", "Dishwasher", "Balcony", "Air conditioning", "Fitness room",
             "Bike storage", "Storage locker", "Elevator", "Fireplace", "Private yard"]
UTILITIES = ["Heat", "Water", "Electricity", "Internet"]


def r(lo: float, hi: float) -> int:
    return round(random.uniform(lo, hi))


def round25(x: float) -> int:
    return int(round(x / 25) * 25)


def month_end(d: date) -> date:
    return d.replace(day=calendar.monthrange(d.year, d.month)[1])


def season_factor(d: date) -> float:
    """Winter is slow for leasing in Alberta, summer is busy."""
    return {12: 1.4, 1: 1.45, 2: 1.3, 3: 1.1, 5: 0.85, 6: 0.8, 7: 0.8, 8: 0.85}.get(d.month, 1.0)


def rand_dt(d: date) -> datetime:
    return datetime.combine(d, time(r(8, 20), r(0, 59)))


# ---------------------------------------------------------------- portfolio

def make_vendors(db):
    plan = {
        "inspection": [("KO Realty Inspections", 0.5, 4.8)],
        "cleaning": [("Sparkle Pro Cleaning", 2.0, 4.6), ("Prairie Clean Co.", 3.5, 4.1),
                     ("Fresh Start Cleaners", 1.5, 4.7)],
        "repairs": [("Chinook Handyman", 3.0, 4.4), ("Bow River Repairs", 5.0, 3.9),
                    ("FixRight Maintenance", 2.5, 4.5)],
        "painting": [("Northside Painters", 3.0, 4.3), ("Clean Coat Painting", 4.5, 4.0)],
        "photography": [("Bright Frame Photo", 1.5, 4.8), ("ListShot Media", 3.0, 4.2)],
    }
    vendors = {}
    for city in TARGET_UNITS:
        for trade, items in plan.items():
            for name, days, rating in items:
                v = Vendor(name=f"{name} ({city[:3].upper()})", trade=trade, city=city,
                           avg_turnaround_days=days, rating=rating)
                db.add(v)
                vendors.setdefault((city, trade), []).append(v)
    db.flush()
    return vendors


def make_portfolio(db):
    owners = [Owner(name=fake.name() if random.random() < 0.7 else f"{fake.last_name()} Holdings Ltd.",
                    email=f"owner{i}@example.com") for i in range(1, 41)]
    db.add_all(owners)
    db.flush()

    units: list[Unit] = []
    used_names: set[str] = set()
    for city, target in TARGET_UNITS.items():
        count = 0
        while count < target:
            hood, (mult, quad) = random.choice(list(NEIGHBOURHOODS[city].items()))
            ptype = random.choices(["apartment", "condo", "townhouse", "house"], [45, 25, 20, 10])[0]
            n_units = {"apartment": r(12, 36), "condo": r(1, 4), "townhouse": r(4, 8), "house": 1}[ptype]
            n_units = min(n_units, target - count)
            street_no = r(100, 9999) if city == "Calgary" else r(10000, 11999)
            street = f"{r(1, 90)} {random.choice(['Ave', 'St'])} {quad}"
            name = {"apartment": f"The {fake.last_name()}", "condo": f"{hood} Condos",
                    "townhouse": f"{hood} Townhomes", "house": f"{street_no} {street}"}[ptype]
            # Keep building names unique so cards are never confused
            base, n = name, 2
            while name in used_names:
                name = f"{base} {['', '', 'II', 'III', 'IV', 'V', 'VI'][n] if n < 7 else n}"
                n += 1
            used_names.add(name)
            prop = Property(
                owner=random.choice(owners), name=name, city=city, neighbourhood=hood,
                address=f"{street_no} {street}, {city}, AB", property_type=ptype,
                year_built=r(1965, 2024),
                photo="/images/exterior-townhouse.jpg" if ptype in ("townhouse", "house")
                else "/images/exterior-walkup.jpg",
            )
            db.add(prop)
            for i in range(n_units):
                if ptype in ("townhouse", "house"):
                    beds = random.choices([2, 3], [40, 60])[0]
                else:
                    beds = random.choices([0, 1, 2, 3], [8, 50, 35, 7])[0]
                rent = BASE_RENT[city][beds] * mult * random.uniform(0.94, 1.06)
                if ptype in ("townhouse", "house"):
                    rent *= 1.08
                unit = Unit(
                    property=prop,
                    unit_number=str(100 * (i // 8 + 1) + i % 8 + 1) if n_units > 1 else "Main",
                    bedrooms=beds,
                    bathrooms=1.0 if beds <= 1 else random.choice([1.0, 1.5, 2.0, 2.5]),
                    sqft=r(*SQFT[beds]),
                    market_rent=round25(rent),
                    pets_allowed=random.random() < 0.45,
                    parking=random.choice(["Underground stall", "Surface stall", "Street", "Garage", "None"]),
                    utilities_included=random.sample(UTILITIES, k=r(0, 2)),
                    amenities=random.sample(AMENITIES, k=r(2, 5)),
                    status="occupied",
                )
                units.append(unit)
            count += n_units
    db.add_all(units)
    db.flush()
    return units


# ---------------------------------------------------------------- turnovers

def stage_path(pre_marketed: bool, pre_success: bool, move_out: date, asking_ratio: float, city: str = "Calgary"):
    """Return [(stage, days)] for one turnover, notice first."""
    # Calgary has higher vacancy than Edmonton in 2026, so leasing is slower
    season = season_factor(move_out) * (1.15 if city == "Calgary" else 0.9)
    notice_len = r(30, 35)
    path: list[tuple[Stage, int]] = []

    if pre_marketed:
        notice_days = r(1, 4)
        path += [(Stage.NOTICE, notice_days), (Stage.PRE_MARKETING, notice_len - notice_days)]
    else:
        path.append((Stage.NOTICE, notice_len))  # nobody acts until move-out

    path += [(Stage.MOVE_OUT_INSPECTION, r(0, 1) if pre_marketed else r(0, 3)),
             (Stage.MAKE_READY, max(1, round(random.lognormvariate(1.5, 0.45))))]

    price_penalty = 1 + max(0.0, asking_ratio - 1) * 8
    if pre_marketed and pre_success:
        path.append((Stage.LEASE_SIGNED, r(0, 2)))
    elif pre_marketed:  # pre-marketing didn't land a tenant in time
        path += [(Stage.SHOWINGS, max(1, round(r(2, 7) * season * price_penalty))),
                 (Stage.SCREENING, r(1, 3)), (Stage.LEASE_SIGNED, r(1, 4))]
    else:
        path += [(Stage.PHOTOS, r(0, 4)), (Stage.LISTED, r(1, 5)),
                 (Stage.SHOWINGS, max(2, round(r(3, 10) * season * price_penalty))),
                 (Stage.SCREENING, r(1, 5)), (Stage.LEASE_SIGNED, r(1, 5))]
    path.append((Stage.MOVED_IN, 0))
    return path


def listing_text(unit: Unit) -> tuple[str, str]:
    p = unit.property
    beds = "Studio" if unit.bedrooms == 0 else f"{unit.bedrooms} Bed"
    title = f"{beds} {p.property_type.title()} in {p.neighbourhood} - ${unit.market_rent}/mo"
    desc = (f"{beds}, {unit.bathrooms} bath {p.property_type} in {p.neighbourhood}, {p.city}. "
            f"{unit.sqft} sq ft. Features: {', '.join(unit.amenities)}. "
            f"Parking: {unit.parking}. {'Pets considered.' if unit.pets_allowed else 'No pets.'}")
    return title, desc


class Builder:
    def __init__(self, db, vendors):
        self.db = db
        self.vendors = vendors

    @staticmethod
    def phone(city: str) -> str:
        return fake.numerify(f"({'403' if city == 'Calgary' else '780'}) ###-####")

    def tenant(self, city: str) -> Tenant:
        t = Tenant(full_name=fake.name(), email=f"{fake.user_name()}{r(1, 99)}@example.com",
                   phone=self.phone(city))
        self.db.add(t)
        return t

    def vendor(self, city: str, trade: str) -> Vendor:
        return random.choice(self.vendors[(city, trade)])

    def build(self, unit: Unit, path, notice_date: date, current_index: int | None,
              pre_marketed: bool, asking_ratio: float):
        """Create a turnover with its history.

        current_index=None -> finished turnover; otherwise the index in `path`
        of the stage the unit is in right now (later stages not created).
        """
        city = unit.property.city
        # Stage start dates
        starts, d = [], notice_date
        for _, days in path:
            starts.append(d)
            d += timedelta(days=days)
        stage_start = {s: starts[i] for i, (s, _) in enumerate(path)}
        move_out = stage_start[Stage.MOVE_OUT_INSPECTION]
        finished = current_index is None
        last = len(path) - 1 if finished else current_index

        prev_rent = round25(unit.market_rent * random.uniform(0.93, 1.0))
        asking = round25(unit.market_rent * asking_ratio)

        # Outgoing lease (old tenant)
        old = Lease(unit=unit, tenant=self.tenant(city),
                    start_date=move_out - timedelta(days=r(365, 1400)), end_date=move_out,
                    monthly_rent=prev_rent,
                    status="ended" if move_out <= TODAY else "active")
        self.db.add(old)

        cur_stage = path[last][0]
        t = Turnover(unit=unit, notice_date=notice_date, move_out_date=move_out,
                     current_stage=cur_stage, stage_entered_at=starts[last],
                     status="completed" if finished else "active",
                     autopilot=False, pre_marketed=pre_marketed,
                     previous_rent=prev_rent, asking_rent=asking)
        t.outgoing_lease = old
        self.db.add(t)

        for i in range(last + 1):
            s, days = path[i]
            self.db.add(StageEvent(turnover=t, stage=s, entered_at=starts[i],
                                   exited_at=(starts[i] + timedelta(days=days)) if i < last or finished else None))

        stages = [s for s, _ in path]
        reached = set(stages[: last + 1])

        def done(s: Stage) -> bool:
            return s in reached and (finished or stages.index(s) < last)

        # Tasks
        def task(kind, trade, when, stage, cost):
            status = "done" if done(stage) else "scheduled"
            self.db.add(Task(turnover=t, task_type=kind, vendor=self.vendor(city, trade),
                             scheduled_for=when, status=status, cost=cost,
                             completed_at=when if status == "done" else None))

        if Stage.MOVE_OUT_INSPECTION in reached:
            task("move_out_inspection", "inspection", move_out, Stage.MOVE_OUT_INSPECTION, 0)
        if Stage.MAKE_READY in reached:
            mr = stage_start[Stage.MAKE_READY]
            task("cleaning", "cleaning", mr, Stage.MAKE_READY, r(250, 450))
            if random.random() < 0.6:
                task("repairs", "repairs", mr + timedelta(days=1), Stage.MAKE_READY, r(150, 1500))
            if random.random() < 0.3:
                task("painting", "painting", mr, Stage.MAKE_READY, r(400, 1200))
        if Stage.PHOTOS in reached:
            task("photos", "photography", stage_start[Stage.PHOTOS], Stage.PHOTOS, 150)

        # Listing + leads
        list_start = stage_start.get(Stage.PRE_MARKETING) or stage_start.get(Stage.LISTED)
        if list_start and list_start <= starts[last]:
            if Stage.PRE_MARKETING in stage_start:
                task("photos", "photography", list_start, Stage.PRE_MARKETING, 150)
            title, desc = listing_text(unit)
            price = asking
            leasing_end = starts[last] if not finished else stage_start[Stage.LEASE_SIGNED]
            listing_days = max(1, (min(leasing_end, TODAY) - list_start).days)
            for channel in ("rentfaster", "facebook"):
                lst = Listing(turnover=t, channel=channel, title=title, description=desc,
                              price=price, posted_at=list_start,
                              status="closed" if finished or cur_stage == Stage.LEASE_SIGNED else "live")
                self.db.add(lst)
                per_day = 0.75 * season_factor(list_start) ** -1 * 2.718 ** (-(asking_ratio - 1) * 12)
                n_leads = min(25, round(per_day * listing_days * random.uniform(0.6, 1.3)))
                for _ in range(n_leads):
                    got = list_start + timedelta(days=r(0, max(0, listing_days - 1)))
                    rec = rand_dt(got)
                    replied = random.random() < 0.85
                    self.db.add(Lead(
                        listing=lst, name=fake.name(), received_at=rec,
                        responded_at=rec + timedelta(hours=random.uniform(1, 30)) if replied else None,
                        showing_at=rec + timedelta(days=r(1, 4)) if replied and random.random() < 0.4 else None,
                        status=random.choice(["replied", "showing", "lost"]) if replied else "new"))

        # Applications
        screen_start = stage_start.get(Stage.SCREENING) or (
            stage_start[Stage.PRE_MARKETING] + timedelta(days=r(5, 15)) if pre_marketed else None)
        if screen_start and screen_start <= starts[last] and (Stage.SCREENING in reached or Stage.LEASE_SIGNED in reached):
            n = r(1, 4)
            approved_idx = 0 if (finished or Stage.LEASE_SIGNED in reached) else None
            for k in range(n):
                approved = k == approved_idx
                rent = asking
                self.db.add(Application(
                    turnover=t, applicant_name=fake.name(),
                    email=f"{fake.user_name()}@example.com", phone=self.phone(city),
                    employer=fake.company(), monthly_income=round25(rent * random.uniform(2.2 if not approved else 2.8, 4.5)),
                    household_size=r(1, 4), has_pets=random.random() < 0.3,
                    desired_move_in=move_out + timedelta(days=r(0, 20)),
                    submitted_at=screen_start + timedelta(days=r(0, 1)),
                    decided_at=screen_start + timedelta(days=r(1, 3)) if (approved or approved_idx is not None) else None,
                    status="approved" if approved else ("declined" if approved_idx is not None and random.random() < 0.6
                                                        else ("withdrawn" if approved_idx is not None else "submitted"))))

        # Price drop if the unit sat in showings too long
        final_rent = asking
        showing_days = dict(path).get(Stage.SHOWINGS, 0)
        if showing_days > 14:
            final_rent = asking - random.choice([50, 75, 100])
        t.asking_rent = asking

        # Incoming lease (new tenant)
        if Stage.LEASE_SIGNED in reached:
            move_in = stage_start[Stage.MOVED_IN]
            new = Lease(unit=unit, tenant=self.tenant(city), start_date=move_in,
                        end_date=move_in + timedelta(days=365), monthly_rent=final_rent,
                        status="active" if finished else "upcoming")
            self.db.add(new)
            t.incoming_lease = new
            t.final_rent = final_rent
            if finished:
                t.move_in_date = move_in

        # Unit status
        if finished:
            unit.status = "occupied"
        elif cur_stage in (Stage.NOTICE, Stage.PRE_MARKETING):
            unit.status = "notice"
        else:
            unit.status = "vacant"
        return t


def occupied_lease(b: Builder, unit: Unit):
    start = TODAY - timedelta(days=r(60, 1400))
    month_to_month = random.random() < 0.3
    end = None if month_to_month else start + timedelta(days=365 * ((TODAY - start).days // 365 + 1))
    b.db.add(Lease(unit=unit, tenant=b.tenant(unit.property.city), start_date=start, end_date=end,
                   monthly_rent=round25(unit.market_rent * random.uniform(0.9, 1.0)), status="active"))


# Active turnovers right now: stage -> how many
ACTIVE_MIX = {
    Stage.NOTICE: 10, Stage.PRE_MARKETING: 6, Stage.MOVE_OUT_INSPECTION: 3, Stage.MAKE_READY: 8,
    Stage.PHOTOS: 4, Stage.LISTED: 4, Stage.SHOWINGS: 10, Stage.SCREENING: 5, Stage.LEASE_SIGNED: 5,
}
COMPLETED_TURNOVERS = 330


def seed():
    db = SessionLocal()
    try:
        db.execute(text(
            "TRUNCATE applications, leads, listings, tasks, stage_events, turnovers, leases, "
            "tenants, units, properties, owners, vendors RESTART IDENTITY CASCADE"))
        vendors = make_vendors(db)
        units = make_portfolio(db)
        b = Builder(db, vendors)
        random.shuffle(units)

        # Turnovers in progress right now
        i = 0
        for stage, count in ACTIVE_MIX.items():
            for _ in range(count):
                unit = units[i]; i += 1
                pre = stage == Stage.PRE_MARKETING or (stage != Stage.NOTICE and random.random() < 0.15)
                ratio = random.gauss(1.03, 0.05)
                path = stage_path(pre, random.random() < 0.6, TODAY, ratio, unit.property.city)
                stages = [s for s, _ in path]
                if stage not in stages:  # e.g. pre-marketed path skips photos/listed
                    pre = False
                    path = stage_path(False, False, TODAY, ratio, unit.property.city)
                    stages = [s for s, _ in path]
                idx = stages.index(stage)
                target = STAGE_INFO[stage]["target_days"]
                # how long it has been in the current stage (some are stuck)
                stuck = random.random() < 0.35
                elapsed = r(target + 2, target * 2 + 6) if stuck else r(0, max(0, target - 1))
                if stage == Stage.NOTICE:
                    elapsed = r(0, 12)
                if stage == Stage.PRE_MARKETING:
                    elapsed = r(3, 20)
                back = elapsed + sum(d for _, d in path[:idx])
                notice_date = TODAY - timedelta(days=back)
                # keep elapsed in the path so future dates (move-out) stay sensible
                if stage in (Stage.NOTICE, Stage.PRE_MARKETING):
                    pass
                else:
                    path[idx] = (stage, elapsed)
                b.build(unit, path, notice_date, idx, pre, ratio)

        # Finished turnovers over the last 12 months (the "before" baseline)
        for _ in range(COMPLETED_TURNOVERS):
            unit = units[i]; i += 1
            pre = random.random() < 0.15
            ratio = random.gauss(1.03, 0.05)
            # Move-outs land on month ends between ~12 and ~1.5 months ago
            mo = month_end(TODAY - timedelta(days=r(45, 365)))
            path = stage_path(pre, random.random() < 0.7, mo, ratio, unit.property.city)
            # A finished turnover must have its move-in before today
            while sum(d for s, d in path if s not in (Stage.NOTICE, Stage.PRE_MARKETING)) >= (TODAY - mo).days - 1:
                path = stage_path(pre, random.random() < 0.7, mo, ratio, unit.property.city)
            notice_date = mo - timedelta(days=sum(d for s, d in path
                                                  if s in (Stage.NOTICE, Stage.PRE_MARKETING)))
            b.build(unit, path, notice_date, None, pre, ratio)

        # Everyone else: a sitting tenant
        for unit in units[i:]:
            occupied_lease(b, unit)

        db.merge(AppMeta(key="seeded_on", value=TODAY.isoformat()))
        db.commit()
        print_summary(db)
    finally:
        db.close()


def print_summary(db):
    q = lambda sql: db.execute(text(sql)).all()  # noqa: E731
    print("Counts:")
    for tbl in ["properties", "units", "leases", "turnovers", "stage_events", "tasks",
                "listings", "leads", "applications", "vendors"]:
        print(f"  {tbl:14} {db.execute(text(f'SELECT count(*) FROM {tbl}')).scalar()}")
    print("Units by city/status:", q("SELECT p.city, u.status, count(*) FROM units u JOIN properties p "
                                     "ON p.id=u.property_id GROUP BY 1,2 ORDER BY 1,2"))
    print("Avg days vacant (completed):", q(
        "SELECT pre_marketed, count(*), round(avg(move_in_date - move_out_date),1) "
        "FROM turnovers WHERE status='completed' GROUP BY 1"))
    print("Active by stage:", q("SELECT current_stage, count(*) FROM turnovers WHERE status='active' "
                                "GROUP BY 1 ORDER BY 1"))


if __name__ == "__main__":
    seed()
