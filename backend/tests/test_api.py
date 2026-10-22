def occupied_unit(client, city="Calgary"):
    return client.get("/api/units", params={"status": "occupied", "city": city, "limit": 1}).json()[0]


def test_board_has_nine_columns_and_summary(client):
    d = client.get("/api/board").json()
    assert [c["key"] for c in d["columns"]][0] == "notice"
    assert len(d["columns"]) == 9  # "moved in" is not a column
    assert d["summary"]["active"] == sum(len(c["cards"]) for c in d["columns"])
    assert d["summary"]["late"] > 0


def test_board_city_filter(client):
    d = client.get("/api/board", params={"city": "Edmonton"}).json()
    cities = {card["unit"]["city"] for col in d["columns"] for card in col["cards"]}
    assert cities == {"Edmonton"}


def test_notice_autopilot_plans_whole_turnover(client):
    u = occupied_unit(client)
    r = client.post(f"/api/units/{u['id']}/notice", json={"autopilot": True})
    assert r.status_code == 200
    t = r.json()["turnover"]
    assert t["stage"] == "pre_marketing" and t["autopilot"] and t["pre_marketed"]
    assert {k["type"] for k in t["tasks"]} == {"photos", "move_out_inspection", "cleaning", "repairs"}
    assert all(k["auto_created"] and k["vendor"] for k in t["tasks"])
    assert {li["channel"] for li in t["listings"]} == {"rentfaster", "facebook"}
    assert t["asking_rent"] > 0
    # second notice on the same unit is refused
    assert client.post(f"/api/units/{u['id']}/notice", json={}).status_code == 409


def test_notice_without_autopilot_just_waits(client):
    u = occupied_unit(client, "Edmonton")
    t = client.post(f"/api/units/{u['id']}/notice", json={"autopilot": False}).json()["turnover"]
    assert t["stage"] == "notice" and t["tasks"] == [] and t["listings"] == []


def test_move_out_date_must_follow_notice(client):
    u = occupied_unit(client)
    r = client.post(f"/api/units/{u['id']}/notice",
                    json={"notice_date": "2026-10-10", "move_out_date": "2026-10-01"})
    assert r.status_code == 422


def test_stages_only_move_forward(client):
    u = occupied_unit(client)
    tid = client.post(f"/api/units/{u['id']}/notice", json={}).json()["turnover"]["id"]
    d = client.post(f"/api/turnovers/{tid}/move", json={}).json()
    assert d["stage"] == "move_out_inspection" and d["unit"]["status"] == "vacant"
    assert client.post(f"/api/turnovers/{tid}/move", json={"stage": "notice"}).status_code == 422


def test_full_flow_to_moved_in(client):
    board = client.get("/api/board").json()
    card = next(c for col in board["columns"] if col["key"] == "screening" for c in col["cards"])
    d = client.get(f"/api/turnovers/{card['id']}").json()
    first = d["applications"][0]
    d = client.post(f"/api/applications/{first['id']}/decision", json={"approve": True}).json()
    assert d["incoming_tenant"] == first["applicant_name"]
    assert all(a["status"] != "submitted" for a in d["applications"])
    d = client.post(f"/api/turnovers/{card['id']}/move", json={}).json()
    assert d["stage"] == "lease_signed" and all(li["status"] == "closed" for li in d["listings"])
    d = client.post(f"/api/turnovers/{card['id']}/move", json={}).json()
    assert d["status"] == "completed" and d["unit"]["status"] == "occupied" and d["move_in_date"]


def test_price_suggestion_shape(client):
    board = client.get("/api/board").json()
    card = next(c for col in board["columns"] if col["key"] == "showings" for c in col["cards"])
    d = client.get(f"/api/turnovers/{card['id']}/price-suggestion").json()
    assert d["action"] in {"lower", "refresh_listing", "watch", "raise", "hold"}
    assert d["recommended_rent"] % 25 == 0
    assert d["comparables"]["count"] > 0


def test_set_price_updates_live_listings(client):
    board = client.get("/api/board").json()
    card = next(c for col in board["columns"] if col["key"] == "showings" for c in col["cards"])
    d = client.post(f"/api/turnovers/{card['id']}/price", json={"price": 1500}).json()
    assert d["asking_rent"] == 1500
    assert all(li["price"] == 1500 for li in d["listings"] if li["status"] == "live")


def test_dashboard_stage_days_add_up(client):
    d = client.get("/api/dashboard").json()
    k = d["kpis"]
    assert k["total_units"] == 800 and k["turnovers_12m"] > 0
    total = sum(s["avg_days"] for s in d["stage_breakdown"])
    assert abs(total - k["avg_days_vacant_12m"]) < 1.0
    assert d["pre_marketing"]["with"]["avg_days_vacant"] < d["pre_marketing"]["without"]["avg_days_vacant"]


def test_not_found(client):
    assert client.get("/api/turnovers/999999").status_code == 404
    assert client.get("/api/units/999999").status_code == 404
