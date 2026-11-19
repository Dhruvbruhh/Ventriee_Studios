"""Runs one Jupyter kernel for Ventriee Studios and speaks JSON lines on stdin/stdout.

In:  {"type": "execute", "id": "...", "code": "..."} | {"type": "interrupt"} | {"type": "restart"} | {"type": "shutdown"}
Out: {"type": "ready"} | {"type": "output", "id", "output": <nbformat output>} | {"type": "done", "id", "count", "status"} | {"type": "error", "message"}
"""
import json
import queue
import sys
import threading

try:
    from jupyter_client import KernelManager
except ImportError:
    print(json.dumps({"type": "error", "message": "Jupyter is not installed. Run: python -m pip install jupyter_client ipykernel"}), flush=True)
    sys.exit(2)

out_lock = threading.Lock()


def send(msg):
    with out_lock:
        sys.stdout.write(json.dumps(msg) + "\n")
        sys.stdout.flush()


km = KernelManager(kernel_name=sys.argv[1] if len(sys.argv) > 1 else "python3")
try:
    km.start_kernel()
    kc = km.client()
    kc.start_channels()
    kc.wait_for_ready(timeout=120)
except Exception as e:  # noqa: BLE001 - any start failure is reported, not raised
    send({"type": "error", "message": f"The kernel did not start: {e}"})
    sys.exit(3)
send({"type": "ready"})

requests = queue.Queue()


def read_stdin():
    for line in sys.stdin:
        try:
            req = json.loads(line)
        except ValueError:
            continue
        # Interrupts must not wait behind a running cell.
        if req.get("type") == "interrupt":
            km.interrupt_kernel()
        else:
            requests.put(req)
    requests.put({"type": "shutdown"})


threading.Thread(target=read_stdin, daemon=True).start()


def to_output(kind, c):
    if kind == "stream":
        return {"output_type": "stream", "name": c.get("name", "stdout"), "text": c.get("text", "")}
    if kind == "error":
        return {"output_type": "error", "ename": c.get("ename", ""), "evalue": c.get("evalue", ""), "traceback": c.get("traceback", [])}
    if kind == "execute_result":
        return {"output_type": "execute_result", "data": c.get("data", {}), "metadata": c.get("metadata", {}), "execution_count": c.get("execution_count")}
    return {"output_type": "display_data", "data": c.get("data", {}), "metadata": c.get("metadata", {})}


while True:
    req = requests.get()
    kind = req.get("type")
    if kind == "shutdown":
        break
    if kind == "restart":
        km.restart_kernel()
        kc.wait_for_ready(timeout=120)
        send({"type": "ready"})
        continue
    if kind != "execute":
        continue
    msg_id = kc.execute(req.get("code", ""))
    count, status = None, "ok"
    while True:
        try:
            msg = kc.get_iopub_msg(timeout=1)
        except queue.Empty:
            if not km.is_alive():
                status = "error"
                send({"type": "output", "id": req.get("id"), "output": {"output_type": "error", "ename": "KernelDied", "evalue": "The kernel stopped", "traceback": []}})
                break
            continue
        if msg.get("parent_header", {}).get("msg_id") != msg_id:
            continue
        t, c = msg["msg_type"], msg["content"]
        if t in ("stream", "error", "execute_result", "display_data"):
            if t == "error":
                status = "error"
            send({"type": "output", "id": req.get("id"), "output": to_output(t, c)})
        elif t == "execute_input":
            count = c.get("execution_count")
        elif t == "status" and c.get("execution_state") == "idle":
            break
    send({"type": "done", "id": req.get("id"), "count": count, "status": status})

kc.stop_channels()
km.shutdown_kernel(now=True)
