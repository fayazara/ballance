#!/usr/bin/env python3
"""Recover the three Physicalize bodies of the push gate without executing it."""
import argparse
import json
from original_chunks import ChunkDump
parser = argparse.ArgumentParser(); parser.add_argument('dump')
d = ChunkDump(parser.parse_args().dump)
parts = [d.physicalize(i) for i in [95,139,178]]
assert [p['target'] for p in parts] == ['P_Modul_01_Filler','P_Modul_01_Rinne','P_Modul_01_Pusher']
print(json.dumps({'source':'P_Modul_01.nmo','parts':parts},indent=2))
