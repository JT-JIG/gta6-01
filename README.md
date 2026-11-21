[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/JT-JIG/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard)
[![Reward](https://make.fun/badge/gta6-01/JT-JIG/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01/leaderboard)

# Solmar City — an open-world crime game

An entry for make.fun's [Make GTA 6 bounty](https://make.fun/bounty/gta6-01): a
3D open-world crime game that runs in a desktop browser from static files,
with no network requests. Built with three.js (vendored under
`game/vendor/`).

Rex Vega drove one job too many for the wrong people. Now he owes fixer Mara
Quinn — and the only way square is through her jobs. Steal cars, outrun the
Solmar PD, and work the city until the debt is paid.

## What is in the game

- **A city to explore on foot and by car** — a seeded grid city with textured
  buildings, a coastal boulevard, palms, street lamps and a sea edge.
- **Traffic and pedestrians** — cars drive the road grid and turn at
  intersections; pedestrians stroll the sidewalks and scatter when trouble
  starts.
- **A wanted level and police** — stars rise for stealing cars, hitting
  pedestrians and shooting in public. Cruisers chase on the road grid, ram,
  and pull up to bust you if you stand still. Break line of sight to cool off.
- **Missions and a story** — three story jobs for Mara Quinn (a pickup, losing
  the heat, a timed getaway) plus repeatable delivery work, all marked by a
  green beacon and tracked in the objective panel.
- **Combat** — a hitscan pistol with tracers and muzzle flash on foot, plus a
  melee punch.
- **A HUD with a minimap** — money, health, wanted stars, speed, objective
  text, and a live north-up minimap showing the player, cars, police and the
  mission beacon.
- **A start screen, pause menu, and a save** — progress (money, mission,
  position, health) autosaves to localStorage; the start screen offers
  Continue when a save exists.
- **Sound** — engine hum, sirens, gunshots and cash chimes, all synthesised
  with WebAudio. No audio files.

## Controls

| Key | Action |
| --- | ------ |
| W A S D / Arrows | Move / drive |
| Mouse | Look around (click to lock) |
| E | Enter / exit car |
| Left click | Shoot (on foot) |
| Right click | Punch |
| M | Start next mission / delivery job |
| Shift | Run |
| P / Esc | Pause |

## Play it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome.

## Screenshots

The four screenshots in `screenshots/` were taken from the game itself with
the staging queries in `shots.json` (`?shot=cover|foot|chase|mission`).

## Layout

```
game/
  index.html          page, import map, HUD
  vendor/
    three.module.min.js   vendored three.js (r160)
  src/
    main.js           boot, game loop, camera, staged screenshot setups
    city.js           seeded city generation, textures, collision
    player.js         on-foot movement and the player figure
    vehicles.js       car factory, player driving, parked cars
    traffic.js        traffic AI
    pedestrians.js    pedestrian AI
    police.js         wanted level, cruiser chase AI, busting
    missions.js       story missions, side jobs, objective beacon
    combat.js         shooting and punching
    hud.js            HUD, minimap, menus
    save.js           localStorage save/load
    audio.js          synthesised WebAudio sound
    input.js          keyboard, mouse, pointer lock
main.ts               entrypoint: copies game/ and screenshots/ to /output
                      and writes dossier.json
```

A wholly original game: its city, names, characters, story and art are its
own, and no part of any commercial title appears in it.
