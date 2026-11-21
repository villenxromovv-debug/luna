import unittest
from unittest.mock import patch

from luna.clipper import yt_words


INFO = {
    "language": "ru",
    "automatic_captions": {"ru-orig": [{"ext": "json3", "url": "https://example.test/captions"}]},
}

PAYLOAD = {
    "events": [
        {
            "tStartMs": 1000,
            "dDurationMs": 900,
            "segs": [
                {"utf8": "Привет, "},
                {"utf8": "как ", "tOffsetMs": 300},
                {"utf8": "дела", "tOffsetMs": 600},
            ],
        },
        {"tStartMs": 2000, "dDurationMs": 500, "segs": [{"utf8": "[Музыка]"}]},
        {
            "tStartMs": 3000,
            "dDurationMs": 400,
            "segs": [{"utf8": ">> "}, {"utf8": "да", "tOffsetMs": 100}],
        },
    ]
}


class TestYouTubeWords(unittest.TestCase):
    def test_words_carry_offsets_and_skip_markers(self):
        with patch.object(yt_words, "_fetch_json", return_value=PAYLOAD):
            words = yt_words.from_info(INFO)
        self.assertEqual([word["text"] for word in words], ["Привет,", "как", "дела", "да"])
        self.assertAlmostEqual(words[0]["start"], 1.0)
        self.assertAlmostEqual(words[1]["start"], 1.3)
        self.assertAlmostEqual(words[2]["start"], 1.6)
        self.assertAlmostEqual(words[3]["start"], 3.1)
        for word in words:
            self.assertLessEqual(word["end"], word["start"] + 0.6)
            self.assertGreater(word["end"], word["start"])

    def test_window_returns_relative_times(self):
        words = [
            {"start": 10.0, "end": 10.4, "text": "раз"},
            {"start": 11.0, "end": 11.4, "text": "два"},
            {"start": 12.5, "end": 12.9, "text": "три"},
        ]
        window = yt_words.window(words, 10.5, 13.0)
        self.assertEqual([word["text"] for word in window], ["два", "три"])
        self.assertAlmostEqual(window[0]["start"], 0.5)
        self.assertAlmostEqual(window[1]["start"], 2.0)

    def test_no_track_returns_none(self):
        self.assertIsNone(yt_words.from_info({"automatic_captions": {}, "subtitles": {}}))

    def test_single_word_events_get_fallback_timing(self):
        payload = {
            "events": [
                {"tStartMs": 0, "dDurationMs": 1000, "segs": [{"utf8": "одно два три"}]},
            ]
        }
        with patch.object(yt_words, "_fetch_json", return_value=payload):
            words = yt_words.from_info(INFO)
        self.assertEqual([word["text"] for word in words], ["одно", "два", "три"])
        self.assertAlmostEqual(words[0]["start"], 0.0)
        self.assertAlmostEqual(words[1]["start"], 0.33, places=2)
        self.assertAlmostEqual(words[2]["start"], 0.67, places=2)


if __name__ == "__main__":
    unittest.main()
