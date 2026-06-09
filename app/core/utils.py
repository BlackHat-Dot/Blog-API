import re
import math


def slugify(value: str) -> str:
    text = value.strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return re.sub(r"-+", "-", text).strip("-")


def calculate_word_count(body: str) -> int:
    return len(re.findall(r"\w+", body))


def calculate_read_time(body: str, words_per_minute: int = 200) -> int:
    words = calculate_word_count(body)
    return max(1, math.ceil(words / words_per_minute))
