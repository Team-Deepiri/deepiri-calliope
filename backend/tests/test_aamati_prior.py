from pathlib import Path

import pytest

from calliope.services.aamati_prior import AamatiPrior

_AAMATI = Path("/tmp/Aamati-doc/aamati_ml")


@pytest.mark.skipif(not _AAMATI.is_dir(), reason="Aamati clone not at /tmp/Aamati-doc/aamati_ml")
def test_align_returns_ranked_moods():
    p = AamatiPrior(_AAMATI)
    res = p.align("174 bpm neurofunk reese dark")
    assert len(res.ranked_moods) == 10
    assert res.ranked_moods[0].score >= res.ranked_moods[-1].score


@pytest.mark.skipif(not _AAMATI.is_dir(), reason="Aamati clone not at /tmp/Aamati-doc/aamati_ml")
def test_groove_ontology_ok():
    o = AamatiPrior(_AAMATI).groove_ontology()
    assert o.get("ok") is True
    assert "mood_feature_map" in o
