"""The 10 turnover stages, in order, with how long each one should take.

`target_days` is the time a unit should spend in that stage before it is
flagged as late on the board. Values are typical industry targets, not
KO Realty's real numbers.
"""

from enum import StrEnum


class Stage(StrEnum):
    NOTICE = "notice"                      # tenant gave notice, still living there
    PRE_MARKETING = "pre_marketing"        # listed while still occupied
    MOVE_OUT_INSPECTION = "move_out_inspection"
    MAKE_READY = "make_ready"              # cleaning + repairs
    PHOTOS = "photos"
    LISTED = "listed"
    SHOWINGS = "showings"
    SCREENING = "screening"
    LEASE_SIGNED = "lease_signed"          # waiting for move-in date
    MOVED_IN = "moved_in"


STAGE_ORDER: list[Stage] = list(Stage)

STAGE_INFO: dict[Stage, dict] = {
    Stage.NOTICE:              {"label": "Notice received",     "target_days": 3},
    Stage.PRE_MARKETING:       {"label": "Pre-marketing",       "target_days": 30},
    Stage.MOVE_OUT_INSPECTION: {"label": "Move-out inspection", "target_days": 1},
    Stage.MAKE_READY:          {"label": "Make-ready",          "target_days": 4},
    Stage.PHOTOS:              {"label": "Photos",              "target_days": 1},
    Stage.LISTED:              {"label": "Listed",              "target_days": 2},
    Stage.SHOWINGS:            {"label": "Showings",            "target_days": 7},
    Stage.SCREENING:           {"label": "Screening",           "target_days": 2},
    Stage.LEASE_SIGNED:        {"label": "Lease signed",        "target_days": 3},
    Stage.MOVED_IN:            {"label": "Moved in",            "target_days": 0},
}

# Stages where the unit is physically empty (counts toward days vacant).
VACANT_STAGES = {
    Stage.MOVE_OUT_INSPECTION, Stage.MAKE_READY, Stage.PHOTOS,
    Stage.LISTED, Stage.SHOWINGS, Stage.SCREENING, Stage.LEASE_SIGNED,
}
