"""Splits a SQL script into statements for migrations.

asyncpg runs one statement per call, so a script is executed statement by statement. A statement
ends at a line ending in `;` that isn't inside a `$$ … $$` function body. Comment-only lines are dropped.
"""


def split_sql(script: str) -> list[str]:
    statements: list[str] = []
    current: list[str] = []
    in_body = False
    for line in script.splitlines():
        stripped = line.strip()
        if not current and (not stripped or stripped.startswith("--")):
            continue
        current.append(line)
        if line.count("$$") % 2 == 1:
            in_body = not in_body
        if not in_body and stripped.endswith(";"):
            statements.append("\n".join(current).strip().removesuffix(";"))
            current = []
    if current and "\n".join(current).strip():
        raise ValueError("SQL script ends without ';'")
    return statements
