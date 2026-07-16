import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "helpers"))
from whisper_parse import parse_whisper_json, group_into_phrases

WHISPER_SAMPLE = {
    "transcription": [
        {"offsets": {"from": 0, "to": 420}, "text": " Hola"},
        {"offsets": {"from": 420, "to": 900}, "text": " mundo"},
        {"offsets": {"from": 2000, "to": 2500}, "text": " nuevo."},
        {"offsets": {"from": 2500, "to": 2600}, "text": "   "},  # vacío -> se descarta
    ]
}


def test_parse_words_seconds_and_strip():
    words = parse_whisper_json(WHISPER_SAMPLE)
    assert words == [
        {"word": "Hola", "start": 0.0, "end": 0.42},
        {"word": "mundo", "start": 0.42, "end": 0.9},
        {"word": "nuevo.", "start": 2.0, "end": 2.5},
    ]


def test_group_phrases_breaks_on_gap():
    words = parse_whisper_json(WHISPER_SAMPLE)
    phrases = group_into_phrases(words, gap=0.5)
    # gap entre "mundo"(end 0.9) y "nuevo"(start 2.0) = 1.1s >= 0.5 -> 2 frases
    assert len(phrases) == 2
    assert phrases[0]["text"] == "Hola mundo"
    assert phrases[0]["start"] == 0.0 and phrases[0]["end"] == 0.9
    assert phrases[1]["text"] == "nuevo."
