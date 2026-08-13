import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "helpers"))
from render import srt_timestamp, build_srt


def test_srt_timestamp():
    assert srt_timestamp(0) == "00:00:00,000"
    assert srt_timestamp(3661.5) == "01:01:01,500"


def test_build_srt():
    subs = [{"start": 0.2, "end": 0.6, "text": "hola"},
            {"start": 2.5, "end": 2.9, "text": "chau"}]
    srt = build_srt(subs)
    assert "1\n00:00:00,200 --> 00:00:00,600\nhola" in srt
    assert "2\n00:00:02,500 --> 00:00:02,900\nchau" in srt
