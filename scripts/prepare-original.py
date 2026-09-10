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
subprocess.run(command + ['--menu'], check=True)
# BMap's image export discards these source TGA alpha channels.
for name in ['DomeShadow', 'Trafo_Shadow_Big']:
    subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-i', str(args.game / 'Textures' / (name + '.tga')), str(output / 'textures' / (name + '.png'))], check=True)
for folder in ['sky', 'audio']: (output / folder).mkdir(exist_ok=True)
subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-i', str(args.game / 'Textures' / 'Particle_Flames.bmp'), str(output / 'textures' / 'Particle_Flames.png')], check=True)
for file in sorted((args.game / 'Textures' / 'sky').glob('*.bmp')):
    subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-i', str(file), str(output / 'sky' / (file.stem + '.jpg'))], check=True)
audio_names = ['Music_Theme_1_1', 'Music_Atmo_1', 'Misc_Checkpoint', 'Misc_StartLevel', 'Misc_Fall', 'Misc_Trafo', 'Misc_Ventilator', 'Misc_extraball', 'Extra_Hit', 'Extra_Start', 'Music_EndCheckpoint', 'Roll_Wood_Stone', 'Roll_Stone_Stone', 'Roll_Paper']
audio_names += [f'Roll_{ball}_{surface}' for ball in ['Wood', 'Stone'] for surface in ['Wood', 'Metal']]
audio_names.append('Misc_RopeTears')
audio_names.append('Misc_UFO_anim')
audio_names += ['Menu_click', 'Menu_dong', 'Menu_load', 'Menu_counter', 'Menu_atmo']
music_data=json.loads((Path(__file__).parent.parent/'src/game/original-music-data.json').read_text())
audio_names += music_data['ambient'] + ['Music_Final','Music_LastFinal']
audio_names += [f'Music_Theme_{theme}{suffix}' for theme in set(music_data['levelThemes']) for suffix in music_data['themeSuffixes']]
sound_data=json.loads((Path(__file__).parent.parent/'src/game/original-audio-data.json').read_text())
audio_names += [name for row in sound_data['materials'].values() for name in row.values()]
for name in dict.fromkeys(audio_names):
    subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-i', str(args.game / 'Sounds' / (name + '.wav')), '-c:a', 'libvorbis', '-q:a', '3', str(output / 'audio' / (name + '.ogg'))], check=True)
    subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-i', str(args.game / 'Sounds' / (name + '.wav')), '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', str(output / 'audio' / (name + '.m4a'))], check=True)
levels = []
for number in range(1, 13):
    document = json.loads((output / f'level_{number:02}.json').read_text())
    checkpoints = next(group['members'] for group in document['groups'] if group['name'] == 'PC_Checkpoints')
    levels.append({'name': f'Level {number:02}', 'difficulty': 'Original course · mechanics in progress' if number > 1 else 'Original course', 'checkpoints': checkpoints})
(output / 'manifest.json').write_text(json.dumps({'version': 1, 'levels': levels}))
print(f'Local asset pack ready: {output}')
