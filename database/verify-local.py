#!/usr/bin/env python3
"""Verify schema in a disposable network-disabled PostgreSQL; never uses live config."""
import json
import pathlib
import subprocess
import time
import uuid

IMAGE = "postgres:17.7-alpine@sha256:bb377b7239d2774ac8cc76f481596ce96c5a6b5e9d141f6d0a0ee371a6e7c0f2"
LABEL = "kanban.test.schema"
ROOT = pathlib.Path(__file__).resolve().parent
NAME = "kanban-schema-" + uuid.uuid4().hex[:12]
container_id = None


def docker(*arguments, **kwargs):
    return subprocess.run(["docker", *arguments], check=True, timeout=kwargs.pop("timeout", 120), **kwargs)


try:
    docker("pull", IMAGE, timeout=180)
    result = docker(
        "run", "--detach", "--rm", "--name", NAME,
        "--label", LABEL + "=" + NAME, "--network", "none",
        "--mount", f"type=bind,source={ROOT},target=/work,readonly",
        "-e", "POSTGRES_DB=kanban_schema_test", "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
        IMAGE, capture_output=True, text=True,
    )
    container_id = result.stdout.strip()
    if len(container_id) != 64 or not all(c in "0123456789abcdef" for c in container_id):
        raise RuntimeError("Unexpected container ID; refusing further operations")
    deadline = time.monotonic() + 60
    while True:
        # Query the actual target database: pg_isready can accept connections on the
        # image's temporary startup server before this database has been created.
        ready = subprocess.run(
            ["docker", "exec", container_id, "psql", "-U", "postgres", "-d", "kanban_schema_test",
             "-v", "ON_ERROR_STOP=1", "-c", "SELECT 1"],
            capture_output=True, timeout=10,
        )
        if ready.returncode == 0:
            break
        if time.monotonic() >= deadline:
            raise RuntimeError("Disposable database did not accept target-database queries within 60 seconds")
        time.sleep(0.25)
    docker(
        "exec", container_id, "psql", "-U", "postgres", "-d", "kanban_schema_test",
        "-v", "ON_ERROR_STOP=1",
        "-f", "/work/tests/bootstrap.sql",
        "-f", "/work/migrations/001_initial_schema.sql",
        "-f", "/work/migrations/002_runtime_role.sql",
        "-f", "/work/tests/verify.sql",
    )
    print("PASS: isolated PostgreSQL schema, grants, ordering constraints and cascades")
finally:
    if container_id:
        inspected = docker("inspect", container_id, capture_output=True, text=True)
        details = json.loads(inspected.stdout)[0]
        if details["Id"] != container_id or details["Config"]["Labels"].get(LABEL) != NAME:
            raise RuntimeError("Unexpected container ownership; refusing cleanup")
        # Only remove this exact, inspected disposable container; no volumes/ports were created.
        docker("rm", "--force", container_id)
