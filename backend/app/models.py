"""Database tables.

Core property-management model (same shape as tools like Yardi):
    Owner -> Property -> Unit -> Lease <- Tenant
Turnover layer (what TurnoverOS adds):
    Unit -> Turnover -> StageEvent / Task / Listing -> Lead / Application
"""

from datetime import date, datetime

from sqlalchemy import (
    JSON, Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base
from .stages import Stage

StageCol = Enum(Stage, name="stage", values_callable=lambda e: [m.value for m in e])


class AppMeta(Base):
    """Small key/value store, e.g. the date the demo data was last seeded."""
    __tablename__ = "app_meta"
    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[str] = mapped_column(String(200))


class Owner(Base):
    __tablename__ = "owners"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160))
    properties: Mapped[list["Property"]] = relationship(back_populates="owner")


class Property(Base):
    __tablename__ = "properties"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("owners.id"))
    name: Mapped[str] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(40), index=True)
    neighbourhood: Mapped[str] = mapped_column(String(60), index=True)
    address: Mapped[str] = mapped_column(String(160))
    property_type: Mapped[str] = mapped_column(String(30))  # apartment, condo, townhouse, house
    year_built: Mapped[int] = mapped_column(Integer)
    photo: Mapped[str] = mapped_column(String(120))

    owner: Mapped[Owner] = relationship(back_populates="properties")
    units: Mapped[list["Unit"]] = relationship(back_populates="property")


class Unit(Base):
    __tablename__ = "units"
    id: Mapped[int] = mapped_column(primary_key=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), index=True)
    unit_number: Mapped[str] = mapped_column(String(20))
    bedrooms: Mapped[int] = mapped_column(Integer)
    bathrooms: Mapped[float] = mapped_column(Numeric(3, 1))
    sqft: Mapped[int] = mapped_column(Integer)
    market_rent: Mapped[int] = mapped_column(Integer)   # what similar units rent for
    pets_allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    parking: Mapped[str] = mapped_column(String(40))
    utilities_included: Mapped[list] = mapped_column(JSON, default=list)
    amenities: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), index=True)  # occupied, notice, vacant

    property: Mapped[Property] = relationship(back_populates="units")
    leases: Mapped[list["Lease"]] = relationship(back_populates="unit")
    turnovers: Mapped[list["Turnover"]] = relationship(back_populates="unit")


class Tenant(Base):
    __tablename__ = "tenants"
    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160))
    phone: Mapped[str] = mapped_column(String(30))


class Lease(Base):
    __tablename__ = "leases"
    id: Mapped[int] = mapped_column(primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"), index=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)   # None = month-to-month
    monthly_rent: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), index=True)  # active, ended, upcoming

    unit: Mapped[Unit] = relationship(back_populates="leases")
    tenant: Mapped[Tenant] = relationship()


class Vendor(Base):
    __tablename__ = "vendors"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    trade: Mapped[str] = mapped_column(String(30), index=True)  # inspection, cleaning, repairs, painting, photography
    city: Mapped[str] = mapped_column(String(40))
    avg_turnaround_days: Mapped[float] = mapped_column(Numeric(3, 1))
    rating: Mapped[float] = mapped_column(Numeric(2, 1))


class Turnover(Base):
    """One changeover: from the old tenant's notice to the new tenant moving in."""
    __tablename__ = "turnovers"
    id: Mapped[int] = mapped_column(primary_key=True)
    unit_id: Mapped[int] = mapped_column(ForeignKey("units.id"), index=True)
    outgoing_lease_id: Mapped[int | None] = mapped_column(ForeignKey("leases.id"))
    incoming_lease_id: Mapped[int | None] = mapped_column(ForeignKey("leases.id"))
    notice_date: Mapped[date] = mapped_column(Date)
    move_out_date: Mapped[date] = mapped_column(Date)
    move_in_date: Mapped[date | None] = mapped_column(Date)
    current_stage: Mapped[Stage] = mapped_column(StageCol, index=True)
    stage_entered_at: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), index=True)  # active, completed
    autopilot: Mapped[bool] = mapped_column(Boolean, default=False)   # created by Notice Autopilot
    pre_marketed: Mapped[bool] = mapped_column(Boolean, default=False)  # listed before move-out
    previous_rent: Mapped[int] = mapped_column(Integer)
    asking_rent: Mapped[int | None] = mapped_column(Integer)
    final_rent: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    unit: Mapped[Unit] = relationship(back_populates="turnovers")
    outgoing_lease: Mapped[Lease | None] = relationship(foreign_keys=[outgoing_lease_id])
    incoming_lease: Mapped[Lease | None] = relationship(foreign_keys=[incoming_lease_id])
    stage_events: Mapped[list["StageEvent"]] = relationship(
        back_populates="turnover", order_by="StageEvent.entered_at")
    tasks: Mapped[list["Task"]] = relationship(back_populates="turnover")
    listings: Mapped[list["Listing"]] = relationship(back_populates="turnover")
    applications: Mapped[list["Application"]] = relationship(back_populates="turnover")


class StageEvent(Base):
    """History: when a turnover entered and left each stage."""
    __tablename__ = "stage_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    turnover_id: Mapped[int] = mapped_column(ForeignKey("turnovers.id"), index=True)
    stage: Mapped[Stage] = mapped_column(StageCol)
    entered_at: Mapped[date] = mapped_column(Date)
    exited_at: Mapped[date | None] = mapped_column(Date)

    turnover: Mapped[Turnover] = relationship(back_populates="stage_events")


class Task(Base):
    """Work to do during a turnover (inspection, cleaning, photos...)."""
    __tablename__ = "tasks"
    id: Mapped[int] = mapped_column(primary_key=True)
    turnover_id: Mapped[int] = mapped_column(ForeignKey("turnovers.id"), index=True)
    task_type: Mapped[str] = mapped_column(String(30))
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id"))
    scheduled_for: Mapped[date | None] = mapped_column(Date)
    completed_at: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20))  # scheduled, done, cancelled
    cost: Mapped[int | None] = mapped_column(Integer)
    auto_created: Mapped[bool] = mapped_column(Boolean, default=False)

    turnover: Mapped[Turnover] = relationship(back_populates="tasks")
    vendor: Mapped[Vendor | None] = relationship()


class Listing(Base):
    __tablename__ = "listings"
    id: Mapped[int] = mapped_column(primary_key=True)
    turnover_id: Mapped[int] = mapped_column(ForeignKey("turnovers.id"), index=True)
    channel: Mapped[str] = mapped_column(String(30))  # rentfaster, facebook, website
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    price: Mapped[int] = mapped_column(Integer)
    posted_at: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20))  # live, closed
    ai_generated: Mapped[bool] = mapped_column(Boolean, default=False)

    turnover: Mapped[Turnover] = relationship(back_populates="listings")
    leads: Mapped[list["Lead"]] = relationship(back_populates="listing")


class Lead(Base):
    """A renter enquiry on a listing. Lead count feeds the price suggestion."""
    __tablename__ = "leads"
    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    received_at: Mapped[datetime] = mapped_column(DateTime)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime)
    showing_at: Mapped[datetime | None] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(20))  # new, replied, showing, applied, lost

    listing: Mapped[Listing] = relationship(back_populates="leads")


class Application(Base):
    __tablename__ = "applications"
    id: Mapped[int] = mapped_column(primary_key=True)
    turnover_id: Mapped[int] = mapped_column(ForeignKey("turnovers.id"), index=True)
    applicant_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160))
    phone: Mapped[str] = mapped_column(String(30))
    employer: Mapped[str | None] = mapped_column(String(120))
    monthly_income: Mapped[int | None] = mapped_column(Integer)
    household_size: Mapped[int | None] = mapped_column(Integer)
    has_pets: Mapped[bool | None] = mapped_column(Boolean)
    desired_move_in: Mapped[date | None] = mapped_column(Date)
    submitted_at: Mapped[date] = mapped_column(Date)
    decided_at: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20))  # submitted, approved, declined, withdrawn
    ai_extracted: Mapped[dict | None] = mapped_column(JSON)
    ai_summary: Mapped[str | None] = mapped_column(Text)

    turnover: Mapped[Turnover] = relationship(back_populates="applications")
