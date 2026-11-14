import json


def strip_markdown_fences(text: str) -> str:
    """Strip an outer ```json ... ``` or ``` ... ``` markdown fence if present.

    Only strips the outer opening fence line and outer closing fence so that
    embedded triple-backtick code blocks inside JSON string values are
    preserved intact.
    """
    clean = text.strip()
    if clean.startswith("```"):
        first_newline = clean.find("\n")
        if first_newline != -1:
            clean = clean[first_newline + 1 :]
        else:
            clean = clean[3:]
            if clean.lower().startswith("json"):
                clean = clean[4:]
        clean = clean.rstrip()
        if clean.endswith("```"):
            clean = clean[:-3]
        clean = clean.strip()
    return clean


def parse_json_response(text: str) -> dict:
    """Strip a ```json ... ``` fence (if present) and parse.

    strict=False: some models (esp. non-Claude ones via BYOK) emit literal
    control characters inside JSON strings instead of the \\n escape the
    system prompts ask for -- same tolerance every existing agent applies.
    """
    clean = strip_markdown_fences(text)
    return json.loads(clean, strict=False)
