#!/usr/bin/env python3
"""Inject private backend env without shell evaluation or echoing configuration."""
import argparse
import os
from pathlib import Path
import re
import shlex
import shutil
import stat
import subprocess
import sys

ALLOWED = {
    "SUPABASE_URL", "SUPABASE_JWT_ISSUER", "SUPABASE_JWKS_URL", "SUPABASE_JWT_AUDIENCE",
    "JDBC_URL", "DB_USERNAME", "DB_PASSWORD", "DB_SSL_ROOT_CERT", "DB_SSL_MODE",
    "DB_POOL_MAX_SIZE", "DB_CONNECTION_TIMEOUT_MS", "DB_STATEMENT_TIMEOUT_MS",
}
ROOT = Path(__file__).resolve().parent.parent


def load_config(path):
    values = {}
    if not path.is_file():
        raise ValueError("Private configuration file is missing; copy the backend example and edit it locally.")
    if os.name != "nt" and stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise ValueError("Private configuration permissions are too broad. Run chmod 600 on the file.")
    if path.stat().st_size > 65536:
        raise ValueError("Private configuration file is unexpectedly large.")
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        key = key.strip()
        if not separator or not re.fullmatch(r"[A-Z][A-Z0-9_]*", key) or key not in ALLOWED:
            raise ValueError(f"Unsupported configuration name at line {number}.")
        if key in values:
            raise ValueError(f"Duplicate configuration name at line {number}.")
        try:
            # Parse quotes only. Never evaluate shell expressions, substitutions or exports.
            tokens = shlex.split(value, comments=True, posix=True)
        except ValueError:
            raise ValueError(f"Invalid quoting at configuration line {number}.") from None
        if len(tokens) > 1:
            raise ValueError(f"Quote values containing spaces at configuration line {number}.")
        values[key] = tokens[0] if tokens else ""
    return values


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / "backend" / ".env")
    parser.add_argument("--check", action="store_true", help="Validate file syntax only, not remote access.")
    parser.add_argument("--maven", default=os.environ.get("MVN", "mvn"))
    args = parser.parse_args()
    try:
        values = load_config(args.env_file.expanduser().resolve())
        if args.check:
            print("Private environment syntax is valid. Values were not printed; connectivity was not checked.")
            return 0
        maven = shutil.which(args.maven)
        if not maven:
            raise ValueError("Maven is not on PATH; use --maven with its executable path.")
        environment = os.environ.copy()
        environment.update(values)
        # Exec via Maven in the foreground; Ctrl+C reaches the regular shutdown path.
        return subprocess.call([maven, "-f", str(ROOT / "backend" / "pom.xml"), "-Pdev", "-DskipTests", "package", "exec:exec"],
                               cwd=ROOT, env=environment)
    except (ValueError, OSError):
        # Never print OSError paths or rejected contents; these may include private values.
        print("Cannot launch: check file permissions, supported variable names, quoting, and Maven availability.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
