import json, urllib.request, urllib.error, uuid, zlib, struct, os, copy, sys
BASE = os.environ.get("BASE_URL", "http://localhost:8000/").rstrip("/") + "/"
B = BASE + "api"
D = "0b6f3c2e-5a41-4d8e-9a10-3f2c1d7e8a01"
ok = fail = 0

def req(method, path, body=None, raw=None, headers=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    h = {"Content-Type": "application/json"} if body is not None else {}
    h.update(headers or {})
    r = urllib.request.Request(B + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode(); return resp.status, (json.loads(txt) if txt else None), resp.headers
    except urllib.error.HTTPError as e:
        txt = e.read().decode(); return e.code, (json.loads(txt) if txt.strip().startswith("{") else txt), e.headers

def check(name, cond, extra=""):
    global ok, fail
    ok += cond; fail += (not cond)
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra else ""))

def multipart(field, filename, content, ctype="application/octet-stream"):
    b = "----x" + uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"{field}\"; filename=\"{filename}\"\r\nContent-Type: {ctype}\r\n\r\n").encode() + content + f"\r\n--{b}--\r\n".encode()
    return body, {"Content-Type": f"multipart/form-data; boundary={b}"}

# list + show
s, j, _ = req("GET", "/dashboards")
check("list dashboards", s == 200 and j["data"][0]["sectionCount"] == 3 and j["data"][0]["elementCount"] == 4, json.dumps(j["data"][0]))
s, j, _ = req("GET", f"/dashboards/{D}")
layout = j["data"]
check("show dashboard tree", s == 200 and [len(x["elements"]) for x in layout["sections"]] == [2, 1, 1])
check("empty JSON objects stay objects", isinstance(layout["sections"][1]["elements"][0]["content"]["labels"], list) and isinstance(layout["settings"], dict))

# round trip
v = layout["version"]
s, j, _ = req("PUT", f"/dashboards/{D}", layout)
check("round-trip save of loaded layout", s == 200 and j["data"]["version"] == v + 1, f"{s} {j.get('error') if isinstance(j, dict) else ''}")
saved = j["data"] if s == 200 else layout
same = all(a["elements"] == b["elements"] for a, b in zip(saved["sections"], layout["sections"]))
check("content unchanged after round trip", same)

s, j, _ = req("PUT", f"/dashboards/{D}", layout)
check("stale version -> 409", s == 409 and j["error"]["currentVersion"] == v + 1, json.dumps(j.get("error")))

# move element between sections + add new element + reorder
l2 = copy.deepcopy(saved)
moved = l2["sections"][0]["elements"].pop(1)
l2["sections"][2]["elements"].append(moved)
l2["sections"][1]["elements"].append({"id": str(uuid.uuid4()), "type": "image", "x": 10.6, "y": 10, "width": 100, "height": 80, "content": {}})
l2["sections"].reverse()
s, j, _ = req("PUT", f"/dashboards/{D}", l2)
check("move element between sections + new empty image + reorder", s == 200 and [len(x["elements"]) for x in j["data"]["sections"]] == [2, 2, 1]
      and j["data"]["sections"][1]["elements"][1]["x"] == 11 and j["data"]["sections"][1]["elements"][1]["content"]["fit"] == "cover",
      f"{s} {j.get('error') if s != 200 else ''}")
cur = j["data"]

# xss
l3 = copy.deepcopy(cur)
txt = next(e for sec in l3["sections"] for e in sec["elements"] if e["type"] == "text")
txt["content"]["html"] = '<p onclick="x()" style="font-size: 20px; background-image: url(evil); color: #f00">Hi <b>bold</b> <script>alert(1)</script><a href="javascript:x">link</a> <img src=x onerror=alert(1)><!-- c --> café ✓</p><font size="5">big</font>'
s, j, _ = req("PUT", f"/dashboards/{D}", l3)
html = next(e for sec in j["data"]["sections"] for e in sec["elements"] if e["type"] == "text")["content"]["html"]
print("     sanitized:", html)
check("sanitizer strips script/handlers/url()/img/a, keeps formatting + UTF-8",
      s == 200 and "script" not in html and "onclick" not in html and "url(" not in html and "<img" not in html and "href" not in html
      and "<b>bold</b>" in html and "font-size: 20px" in html and "café ✓" in html and "big" in html)
cur = j["data"]

# validation errors
bad = {"name": "", "version": cur["version"], "sections": [{"id": "bad", "x": -5, "y": 0, "width": 5, "height": 100, "style": {"background": "red; x"},
       "elements": [{"id": "bad", "type": "video", "x": 0, "y": 0, "width": 50, "height": 50},
                    {"id": str(uuid.uuid4()), "type": "chart", "x": 0, "y": 0, "width": 50, "height": 50, "content": {"dataSource": "api", "metric": "nope", "refreshSec": 1}},
                    {"id": str(uuid.uuid4()), "type": "image", "x": 0, "y": 0, "width": 50, "height": 50, "content": {"src": "https://evil.example/x.png"}}]}]}
s, j, _ = req("PUT", f"/dashboards/{D}", bad)
fields = [e["field"] for e in j["error"]["errors"]]
print("     422 fields:", fields)
check("invalid layout -> 422 with field list", s == 422 and {"name", "sections[0].x", "sections[0].width", "sections[0].id", "sections[0].elements[0].type",
      "sections[0].elements[1].content.metric", "sections[0].elements[1].content.refreshSec", "sections[0].elements[2].content.src", "sections[0].style.fill.color"} <= set(fields))
dup = copy.deepcopy(cur); dup["sections"][0]["elements"][0]["id"] = dup["sections"][1]["elements"][0]["id"]
s, j, _ = req("PUT", f"/dashboards/{D}", dup)
check("duplicate ids -> 422", s == 422, json.dumps(j["error"]["errors"]))
s, _, _ = req("GET", f"/dashboards/{D}")
check("failed saves left data untouched", req("GET", f"/dashboards/{D}")[1]["data"]["version"] == cur["version"])

# styles: new keys round-trip, old keys are converted, bad values are listed
cur = req("GET", f"/dashboards/{D}")[1]["data"]
st = copy.deepcopy(cur)
glow = {"fill": {"type": "linear", "from": "#6d5dfc", "to": "#c86dd7", "angle": 135}, "opacity": 90, "radius": 24, "border": {"width": 2, "color": "#ffffff"}, "shadow": "glow"}
st["sections"][0]["style"] = glow
st["sections"][1]["style"] = {"background": "#101828", "borderColor": "transparent", "borderRadius": 20}
logo = next(e for sec in st["sections"] for e in sec["elements"] if e["type"] == "image")
logo.pop("style"); logo["content"]["borderRadius"] = 300
s, j, _ = req("PUT", f"/dashboards/{D}", st)
check("style keys round-trip", s == 200 and j["data"]["sections"][0]["style"] == glow, json.dumps(j.get("error")) if s != 200 else "")
check("old section style keys are converted", s == 200 and j["data"]["sections"][1]["style"] == {"fill": {"type": "solid", "color": "#101828"}, "opacity": 100, "radius": 20, "border": {"width": 0, "color": "#e3e6eb"}, "shadow": "none"}, json.dumps(j["data"]["sections"][1]["style"]) if s == 200 else "")
saved_logo = next(e for sec in j["data"]["sections"] for e in sec["elements"] if e["id"] == logo["id"]) if s == 200 else {"style": {}, "content": {}}
check("old image radius moves into style (capped at 200)", saved_logo["style"]["radius"] == 200 and "borderRadius" not in saved_logo["content"], json.dumps(saved_logo))
cur = j["data"] if s == 200 else cur
bad = copy.deepcopy(cur)
bad["sections"][0]["style"] = {"fill": {"type": "radial"}, "opacity": 150, "radius": -1, "border": {"width": 40, "color": "red"}, "shadow": "huge"}
s, j, _ = req("PUT", f"/dashboards/{D}", bad)
fields = {e["field"] for e in j["error"]["errors"]} if s == 422 else set()
check("bad style values -> 422 with each field", {f"sections[0].style.{k}" for k in ["fill.type", "opacity", "radius", "border.width", "border.color", "shadow"]} <= fields, str(sorted(fields)))

# create, cross-dashboard id collision, delete
s, j, _ = req("POST", "/dashboards", {"name": "Test board"})
new = j["data"]["id"]
check("create dashboard", s == 201 and j["data"]["sections"] == [] and j["data"]["version"] == 1)
s, j, _ = req("POST", "/dashboards", raw=b"")
check("create with empty body uses default name", s == 201 and j["data"]["name"] == "Untitled dashboard"); req("DELETE", f"/dashboards/{j['data']['id']}")
steal = {"name": "Test board", "version": 1, "sections": [cur["sections"][0]]}
s, j, _ = req("PUT", f"/dashboards/{new}", steal)
check("id owned by another dashboard -> 422", s == 422, j["error"]["message"])
s, _, _ = req("DELETE", f"/dashboards/{new}")
check("delete -> 204, then 404", s == 204 and req("GET", f"/dashboards/{new}")[0] == 404)

# routing / errors
check("bad id -> 404", req("GET", "/dashboards/nope")[0] == 404)
check("unknown route -> 404", req("GET", "/nothing")[0] == 404)
s, _, h = req("PATCH", "/dashboards")
check("wrong method -> 405 + Allow", s == 405 and "GET" in h.get("Allow", ""))
s, j, _ = req("PUT", f"/dashboards/{D}", raw=b"{oops", headers={"Content-Type": "application/json"})
check("malformed JSON -> 400", s == 400, j["error"]["message"])

# chart data
for g in ["live", "month", "day"]:
    s, j, _ = req("GET", f"/chart-data?metric=revenue&granularity={g}&points=5")
    check(f"chart-data {g}", s == 200 and len(j["data"]["labels"]) == 5 and len(j["data"]["timestamps"]) == 5 and len(j["data"]["datasets"][0]["data"]) == 5, f'{j["data"]["labels"]} {j["data"]["datasets"][0]["data"]}')
a = req("GET", "/chart-data?metric=orders&granularity=month&points=6")[1]["data"]["datasets"][0]["data"]
b = req("GET", "/chart-data?metric=orders&granularity=month&points=6")[1]["data"]["datasets"][0]["data"]
check("chart history is stable between requests", a == b)
s, j, _ = req("GET", "/chart-data?metric=conversion&points=3")
check("decimal metric", all(isinstance(x, float) for x in j["data"]["datasets"][0]["data"]), str(j["data"]["datasets"][0]["data"]))
check("bad metric -> 422", req("GET", "/chart-data?metric=nope")[0] == 422)
check("bad points -> 422", req("GET", "/chart-data?metric=revenue&points=999")[0] == 422)
check("metrics list", len(req("GET", "/chart-data/metrics")[1]["data"]["metrics"]) == 4)

# uploads
def png(w, h):
    c = lambda t, x: struct.pack(">I", len(x)) + t + x + struct.pack(">I", zlib.crc32(t + x))
    raw = b"".join(b"\x00" + b"\x25\x63\xeb" * w for _ in range(h))
    return b"\x89PNG\r\n\x1a\n" + c(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + c(b"IDAT", zlib.compress(raw)) + c(b"IEND", b"")
body, h = multipart("image", "logo.png", png(40, 20), "image/png")
s, j, _ = req("POST", "/uploads", raw=body, headers=h)
check("upload png -> 201", s == 201 and j["data"]["width"] == 40 and j["data"]["url"].startswith("uploads/"), json.dumps(j))
url = j["data"]["url"]
with urllib.request.urlopen(BASE + url) as r:
    check("uploaded file is served", r.status == 200 and r.headers["Content-Type"] == "image/png")
l4 = copy.deepcopy(cur)
img = next(e for sec in l4["sections"] for e in sec["elements"] if e["type"] == "image" and e["content"]["src"] == "")
img["content"]["src"] = url
s, j, _ = req("PUT", f"/dashboards/{D}", l4)
check("save layout using uploaded image url", s == 200, json.dumps(j.get("error")) if s != 200 else "")
body, h = multipart("image", "evil.png", b"<?php echo 1;", "image/png")
check("php disguised as png -> 415", req("POST", "/uploads", raw=body, headers=h)[0] == 415)
check("no file -> 400", req("POST", "/uploads", raw=b"", headers={"Content-Type": "multipart/form-data; boundary=x"})[0] == 400)
body, h = multipart("image", "big.png", png(8, 8) + os.urandom(6_000_000), "image/png")
s, j, _ = req("POST", "/uploads", raw=body, headers=h)
check("6 MB upload -> 413", s == 413, j["error"]["message"] if isinstance(j, dict) else str(j)[:80])

print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
