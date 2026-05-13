# Aamati

The upstream [Aamati](https://github.com/jrb00013/Aamati) repository is cloned during the API image build. `AamatiBridge` loads `mood_mappings.py` when present so downstream routes can reuse the same categorical vocabulary without copying large model assets into this repository.
