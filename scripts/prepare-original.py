#!/usr/bin/env python3
"""Prepare a local web asset pack from an extracted Ballance installation."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--game', required=True, type=Path)
parser.add_argument('--library', required=True, type=Path)
parser.add_argument('--output', type=Path, default=Path('.local/original'))
args = parser.parse_args()
output = args.output.resolve()
extractor = Path(__file__).with_name('extract-original.py')
command = [sys.executable, str(extractor), '--library', str(args.library.resolve()), '--game', str(args.game.resolve()), '--output', str(output)]
subprocess.run(command, check=True)
subprocess.run(command + ['--entities'], check=True)
subprocess.run(command + ['--transformer'], check=True)
for folder in ['sky', 'audio']: (output / folder).mkdir(exist_ok=True)
subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-i', str(args.game / 'Textures' / 'Particle_Flames.bmp'), str(output / 'textures' / 'Particle_Flames.png')], check=True)
for file in sorted((args.game / 'Textures' / 'sky').glob('*.bmp')):
    subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-i', str(file), str(output / 'sky' / (file.stem + '.jpg'))], check=True)
audio_names = ['Music_Theme_1_1', 'Music_Atmo_1', 'Misc_Checkpoint', 'Misc_StartLevel', 'Misc_Fall', 'Misc_Trafo', 'Misc_Ventilator', 'Misc_extraball', 'Extra_Hit', 'Music_EndCheckpoint', 'Roll_Wood_Stone', 'Roll_Stone_Stone', 'Roll_Paper']
audio_names += [f'Roll_{ball}_{surface}' for ball in ['Wood', 'Stone'] for surface in ['Wood', 'Metal']]
for name in audio_names:
    subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-i', str(args.game / 'Sounds' / (name + '.wav')), '-c:a', 'libvorbis', '-q:a', '3', str(output / 'audio' / (name + '.ogg'))], check=True)
levels = []
for number in range(1, 13):
    document = json.loads((output / f'level_{number:02}.json').read_text())
    checkpoints = next(group['members'] for group in document['groups'] if group['name'] == 'PC_Checkpoints')
    levels.append({'name': f'Level {number:02}', 'difficulty': 'Original course · mechanics in progress' if number > 1 else 'Original course', 'checkpoints': checkpoints})
(output / 'manifest.json').write_text(json.dumps({'version': 1, 'levels': levels}))
print(f'Local asset pack ready: {output}')
