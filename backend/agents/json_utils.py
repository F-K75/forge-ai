import json


def parse_json_response(text: str) -> dict:
    """Strip a ```json ... ``` fence (if present) and parse.

    strict=False: some models (esp. non-Claude ones via BYOK) emit literal
    control characters inside JSON strings instead of the \\n escape the
    system prompts ask for -- same tolerance every existing agent applies.
    """
    clean = text.strip()
    if clean.startswith("```"):
        clean = clean.split("```")[1]
        if clean.startswith("json"):
            clean = clean[4:]
        clean = clean.strip()
    return json.loads(clean, strict=False)
