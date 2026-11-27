#!/usr/bin/env python3
"""Send one local OS operator request; mutations are never automatically retried."""

from __future__ import annotations

import argparse
import json
import re
import socket
import sys
import uuid
from pathlib import Path


LABEL = re.compile(r"[A-Za-z0-9_-]{1,64}\Z")
ACTIONS = ("status", "start", "pause", "resume", "stop", "reload")
MAX_RESPONSE_BYTES = 65536


def request(socket_path: str, action: str, plugin_id: str | None = None, timeout_ms: int = 2000) -> dict:
    if action not in ACTIONS or (action != "status" and not plugin_id):
        raise ValueError("a valid action and plugin ID are required")
    if plugin_id is not None and not LABEL.fullmatch(plugin_id):
        raise ValueError("plugin ID must contain 1..64 ASCII letters, digits, '_' or '-'")
    if not 1 <= timeout_ms <= 5000:
        raise ValueError("queue timeout must be between 1 and 5000 milliseconds")
    if not Path(socket_path).is_absolute():
        raise ValueError("socket path must be absolute")
    request_id = uuid.uuid4().hex
    payload = {"action": action, "request_id": request_id, "timeout_ms": timeout_ms}
    if plugin_id is not None:
        payload["plugin_id"] = plugin_id
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as channel:
        # Allows queue wait + the server's separate operation deadline + delivery.
        channel.settimeout(timeout_ms / 1000 + 6)
        channel.connect(socket_path)
        channel.sendall(json.dumps(payload, separators=(",", ":")).encode("utf-8") + b"\n")
        chunks = bytearray()
        while b"\n" not in chunks:
            chunk = channel.recv(4096)
            if not chunk:
                raise RuntimeError("connection ended; request outcome is unknown (query status before retrying)")
            chunks.extend(chunk)
            if len(chunks) > MAX_RESPONSE_BYTES + 1:
                raise RuntimeError("operator response exceeds the byte limit")
    response = json.loads(bytes(chunks).decode("utf-8"))
    if not isinstance(response, dict) or response.get("request_id") != request_id:
        raise RuntimeError("invalid response ID; request outcome is unknown")
    return response


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--socket", required=True, help="absolute instance plugin-control socket path")
    parser.add_argument("--timeout-ms", type=int, default=2000, help="queue window, 1..5000ms")
    parser.add_argument("action", choices=ACTIONS)
    parser.add_argument("plugin_id", nargs="?")
    args = parser.parse_args(argv)
    try:
        response = request(args.socket, args.action, args.plugin_id, args.timeout_ms)
    except (OSError, ValueError, RuntimeError) as error:
        print(json.dumps({"ok": False, "error": str(error), "outcome": "unknown"}), file=sys.stderr)
        return 2
    print(json.dumps(response, ensure_ascii=False, indent=2))
    return 0 if response.get("ok") is True else 1


if __name__ == "__main__":
    raise SystemExit(main())
