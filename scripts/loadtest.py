"""Small concurrent load test using only the standard library.

    python scripts/loadtest.py --base http://localhost:8088 --users 20 --seconds 20
"""

import argparse
import json
import statistics
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor


def request(url, token=None, workspace=None, data=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if workspace:
        headers["X-Workspace"] = workspace
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method="POST" if body else "GET")
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.status, res.read()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:8088")
    parser.add_argument("--email", default="owner@acme-corp.test")
    parser.add_argument("--password", default="demo-pass-123")
    parser.add_argument("--workspace", default="acme-corp")
    parser.add_argument("--users", type=int, default=20)
    parser.add_argument("--seconds", type=int, default=20)
    args = parser.parse_args()

    api = f"{args.base}/api"
    _, body = request(f"{api}/auth/token/", data={"email": args.email, "password": args.password})
    token = json.loads(body)["access"]
    _, body = request(f"{api}/projects/", token, args.workspace)
    project = json.loads(body)["results"][0]["id"]

    paths = [
        f"/projects/{project}/board/",
        f"/issues/?project={project}&limit=50",
        f"/issues/?project={project}&q=fix",
        "/notifications/unread-count/",
    ]
    results = {p: [] for p in paths}
    errors = []
    lock = threading.Lock()
    deadline = time.monotonic() + args.seconds

    def worker(offset):
        i = offset
        while time.monotonic() < deadline:
            path = paths[i % len(paths)]
            i += 1
            start = time.perf_counter()
            try:
                request(api + path, token, args.workspace)
                ms = (time.perf_counter() - start) * 1000
                with lock:
                    results[path].append(ms)
            except Exception as exc:
                with lock:
                    errors.append(str(exc))

    started = time.monotonic()
    with ThreadPoolExecutor(args.users) as pool:
        for n in range(args.users):
            pool.submit(worker, n)
    elapsed = time.monotonic() - started

    total = sum(len(v) for v in results.values())
    print(f"{args.users} concurrent users for {elapsed:.0f}s: {total} requests, {total / elapsed:.1f} req/s, {len(errors)} errors")
    print("| Endpoint | requests | p50 ms | p95 ms |")
    print("|---|---:|---:|---:|")
    for path, times in results.items():
        times.sort()
        if times:
            p95 = times[max(0, int(len(times) * 0.95) - 1)]
            print(f"| {path.split('?')[0]}{'?' + path.split('?')[1] if '?' in path else ''} | {len(times)} | "
                  f"{statistics.median(times):.0f} | {p95:.0f} |")


if __name__ == "__main__":
    main()
