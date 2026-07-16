import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "helpers"))
from whisper_parse import (parse_whisper_json, parse_whisper_tokens,
                           merge_punctuation, group_into_phrases)


def test_parse_tokens_reconstructs_words():
    # -ojf: tokens; espacio inicial abre palabra, el resto se pega. [_BEG_] se salta.
    data = {"transcription": [{"tokens": [
        {"text": "[_BEG_]", "offsets": {"from": 0, "to": 0}},
        {"text": " Vak", "offsets": {"from": 280, "to": 300}},
        {"text": "dor", "offsets": {"from": 300, "to": 560}},
        {"text": "[_TT_1004]", "offsets": {"from": 560, "to": 560}},  # token de tiempo: se salta
        {"text": " es", "offsets": {"from": 560, "to": 700}},
        {"text": " tu", "offsets": {"from": 700, "to": 820}},
    ]}]}
    words = parse_whisper_tokens(data)
    assert [w["word"] for w in words] == ["Vakdor", "es", "tu"]
    assert words[0]["start"] == 0.28 and words[0]["end"] == 0.56

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


def test_merge_punctuation_open_and_close():
    raw = parse_whisper_json({"transcription": [
        {"offsets": {"from": 0, "to": 100}, "text": " ¿"},
        {"offsets": {"from": 100, "to": 400}, "text": " Cómo"},
        {"offsets": {"from": 400, "to": 700}, "text": " estás"},
        {"offsets": {"from": 700, "to": 750}, "text": " ?"},
        {"offsets": {"from": 750, "to": 760}, "text": " ,"},  # cierre sin cambio de palabra
    ]})
    merged = merge_punctuation(raw)
    assert [w["word"] for w in merged] == ["¿Cómo", "estás?,"]
    # el signo de apertura no inventa tiempo: arranca con la palabra real
    assert merged[0]["start"] == 0.1 and merged[0]["end"] == 0.4
    # el cierre extiende el end de la palabra anterior
    assert merged[1]["end"] == 0.76


def test_group_phrases_breaks_on_gap():
    words = parse_whisper_json(WHISPER_SAMPLE)
    phrases = group_into_phrases(words, gap=0.5)
    # gap entre "mundo"(end 0.9) y "nuevo"(start 2.0) = 1.1s >= 0.5 -> 2 frases
    assert len(phrases) == 2
    assert phrases[0]["text"] == "Hola mundo"
    assert phrases[0]["start"] == 0.0 and phrases[0]["end"] == 0.9
    assert phrases[1]["text"] == "nuevo."
