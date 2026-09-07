# Ballance reference notes

Research collected on 2026-09-07. These links are reference material, not assets redistributed in this project.

## Gameplay

- [Wikipedia — Ballance](https://en.wikipedia.org/wiki/Ballance_(video_game)): wood/stone/paper transformation pads, material properties, checkpoints, power-ups, elevated tracks, twelve original levels and a bonus thirteenth.
- [Official Steam listing](https://store.steampowered.com/app/2000770/Ballance/): publisher description of timed courses, obstacles, ramps, material-changing puzzles, and increasing difficulty.

The implementation retains the rolling-ball premise, momentum, transformations, suspended tracks, checkpoints, timed scoring, and fall recovery. Its three levels and simplified obstacle simulation are original. Fragile bridges here require paper; this is a deliberate course rule, not a claim of exact original physics parity.

## Visual references

Image search returned the following gameplay reference collections:

1. [StopGame screenshot gallery](https://stopgame.ru/game/ballance) — stone platforms, wooden pathways and rail connections. [Reference image](https://images.stopgame.ru/screenshots/4355/ballance-30.jpg).
2. [Xsolla / RAWG screenshot](https://x.la/g/ballance) — thin metal beams and minimalist score/lives HUD. [Reference image](https://media.rawg.io/media/screenshots/2c1/2c183210bc0b10b8054ff511747f02e8.jpg).
3. [MMO13 gallery](https://mmo13.ru/games/93032_ballance) — wooden ball on paired rails against a sunset sky.
4. [GRYOnline gallery](https://www.gry-online.pl/gry/ballance/zbe60) — platform architecture and decorative towers.
5. [GameTyrant review](https://gametyrant.com/news/ballance-review-out-of-balance) — curved suspended track and clouds.
6. [My Abandonware screenshot gallery](https://www.myabandonware.com/game/ballance-dvz) — checkpoint rings, wood bridges, ramps and pale sky backgrounds. Used as an image reference only; no game download.
7. [Steam community](https://steamcommunity.com/app/2000770) — stone-ball levels and varied raised platforms.
8. [MobyGames](https://www.mobygames.com/game/13647/ballance/) — wooden platforms, multiple ball materials, original HUD.

A direct screenshot download attempt was unavailable in the sandbox. Visual research used the image-search results and their descriptions; the locally rendered game was visually inspected in the Codex in-app Browser. No screenshot from these sources is included in the game.

## Environment artwork

`public/textures/cloudscape.jpg` was generated for this project with the built-in image-generation tool: a panoramic high-altitude cloud ocean, warm afternoon sunlight, cream cloud tops, lavender shadows, and a muted blue upper sky. It is combined with procedural moving mist, fog, directional lighting, and distant floating rock geometry. A procedural sky remains available if the image cannot load.

## Platform reference

The Cloudflare Docs MCP was queried for the existing React/Vite integration:

- [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- [Workers static assets](https://developers.cloudflare.com/workers/static-assets/)

The existing Cloudflare configuration and deployment destination were preserved.
