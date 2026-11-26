# Printed art: sources and credits

`world.jpg` is a sheet of the game's printed matter: the six wall posters, the notice board, the "same hallway"
posters, the evidence-board field photographs, the specimen plate and the pin board (map: `src/gfx/printMap.ts`,
loader: `src/gfx/prints.ts`). Each is built from real imagery and printed in the institute's look (halftone screens,
the green/yellow machine-kit inks, aged paper, Alagard type) by the art pipeline. Nothing here imitates a real brand or
organisation.

## Photographs: Poly Haven (CC0 1.0, public domain)

Poly Haven (https://polyhaven.com) releases every asset under CC0 1.0
(https://creativecommons.org/publicdomain/zero/1.0/). No attribution is required; credit is given with thanks.
HDRI backplates were reprojected from their tonemapped panoramas into ordinary photographs; textures were used as paper,
board and enamel surfaces.

| used for | Poly Haven asset | source |
|---|---|---|
| FOCUS poster | Abandoned Hall 01 (HDRI) | https://polyhaven.com/a/abandoned_hall_01 |
| STAY CALM poster, field photo | Boiler Room (HDRI) | https://polyhaven.com/a/boiler_room |
| BE KIND poster | Empty Play Room (HDRI) | https://polyhaven.com/a/empty_play_room |
| SPECIMEN poster | Hall of Mammals (HDRI) | https://polyhaven.com/a/hall_of_mammals |
| CROSS OVER poster | Hospital Room (HDRI) | https://polyhaven.com/a/hospital_room |
| hallway poster, notice-board snapshot, field photos | Newman Locker Room (HDRI) | https://polyhaven.com/a/newman_locker_room |
| field photos | Debris Basement Corridor (HDRI) | https://polyhaven.com/a/debris_basement_corridor |
| field photo | Bank Vault (HDRI) | https://polyhaven.com/a/bank_vault |
| field photo | Indoor Pool (HDRI) | https://polyhaven.com/a/indoor_pool |
| field photo | Metro Vijzelgracht (HDRI) | https://polyhaven.com/a/metro_vijzelgracht |
| paper foxing and stains | Decrepit Wallpaper (texture) | https://polyhaven.com/a/decrepit_wallpaper |
| notice board, pin board | Oriented Strand Board (texture) | https://polyhaven.com/a/oriented_strand_board |

## Renders of the game itself

* People (the MISSING poster, the notice-board polaroid, the figure in the hallway poster) are renders of the game's
  HumanRig (`src/entities/humanRig.ts`); no face is drawn by hand.
* Inhabitants in the field photographs and on the specimen plate are renders of the game's own creature models.
* The bishop emblem is the institute's mark (`public/brand`).

## Type

* Alagard (`public/fonts/alagard.ttf`), the game's font.
