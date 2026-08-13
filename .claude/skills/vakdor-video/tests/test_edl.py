import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "helpers"))
from edl import validate_edl, total_duration, master_srt_offsets

EDL = {
    "version": 1,
    "sources": {"A": "/x/A.mp4"},
    "ranges": [
        {"source": "A", "start": 2.0, "end": 4.0},
        {"source": "A", "start": 10.0, "end": 11.0},
    ],
    "overlays": [{"file": "o.mp4", "start_in_output": 0.0, "duration": 1.5}],
}


def test_validate_ok():
    assert validate_edl(EDL) == []


def test_validate_catches_bad_range_and_missing_source():
    bad = {"sources": {"A": "/x"}, "ranges": [
        {"source": "A", "start": 5, "end": 4},        # start>=end
        {"source": "B", "start": 0, "end": 1},        # source inexistente
    ]}
    errs = validate_edl(bad)
    assert any("start" in e for e in errs)
    assert any("B" in e for e in errs)


def test_total_duration():
    assert total_duration(EDL) == 3.0  # (4-2)+(11-10)


def test_master_srt_uses_output_timeline():
    transcripts = {"A": {"words": [
        {"word": "hola", "start": 2.2, "end": 2.6},    # dentro range0 (offset salida 0)
        {"word": "chau", "start": 10.5, "end": 10.9},  # dentro range1 (offset salida 2.0)
    ]}}
    subs = master_srt_offsets(EDL, transcripts)
    # "hola": 2.2 - 2.0 + 0.0 = 0.2 ; "chau": 10.5 - 10.0 + 2.0 = 2.5
    assert subs[0]["text"] == "hola" and abs(subs[0]["start"] - 0.2) < 1e-6
    assert subs[1]["text"] == "chau" and abs(subs[1]["start"] - 2.5) < 1e-6
