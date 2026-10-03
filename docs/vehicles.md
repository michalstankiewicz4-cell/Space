# Vehicle lab (vehicles.html) and VehicleKit

Ground vehicles for the planets' surfaces. Started 2026-10-03. The user's
call: a lab of its own, separate from the ship lab ("too much in one file",
and these get driving animations). Sea vehicles will get a separate lab too,
because you'll be able to go under water.

## Files

| File | What it is |
|---|---|
| `js/vehiclekit/vehiclekit.js` | **VehicleKit** (`window.VehicleKit`), a classic script like ShipKit, BodyKit and BaseKit. It holds the vehicles, their animation, a simple driving model and the dust. It is built from ShipKit's generators (plating, solar cells, struts) and needs THREE and ShipKit. Not in the game, nor in the surface lab, yet. |
| `vehicles.html` | The lab. Rough ground with sliders, AUTO driving (wandering, turning back toward the middle) or WASD, NIGHT, DUST and WORK. |

## The vehicles

The story's world has no people, so every vehicle is a robot: sensor heads,
lamps, a sensor band where a windscreen would be, and no cabins.

| id | Name | What for | Drive | Top speed | Work |
|---|---|---|---|---|---|
| `scout` | SCOUT | explores and maps | 6 wheels on rockers, front and rear steer | 58 km/h | the camera head looks around |
| `hauler` | HAULER | carries materials (mine → refinery → base) | 8 wheels, the front two axles steer | 72 km/h | tips its bed |
| `crawler` | CRAWLER | digs where wheels sink | 2 tracks, turns on the spot | 25 km/h | lowers the drill arm, spins the auger |
| `constructor` | CONSTRUCTOR | lifts modules into place | 4 big wheels | 43 km/h | swings the crane |

Units are metres. The origin is the ground under the middle, up is +Y and
the front is +Z.

## How it moves

The caller places and turns `group` on the ground. The kit animates
everything inside it in `update(t, dt, opts)`:

- **Suspension.** `opts.contact(x, z)` gives the ground height under each
  wheel. For tracks, there are four points per track.
  - A plane is fitted through those points by least squares. The body
    settles on it on springs, which gives the height, the pitch and the roll.
  - Each wheel takes up what the plane misses, within ±0.3 m of travel,
    on a stiffer spring.
  - A shock absorber stretches from the body to each hub.
- **Wheels** spin at `speed / radius`. The steered ones turn up to ±0.45 rad;
  the rear ones turn the other way (the scout).
- **Tracks.** Each belt has its own copy of the tread texture, scrolled at
  `speed ± steer`, so on the spot they run in opposite directions.
- **Lamps.** `opts.lights` sets the glowing faces and one SpotLight per
  vehicle (two would cost too much).
- **Beacon.** It blinks harder while the vehicle moves or works.
- **Work.** `opts.work` (0..1) is eased in.
- **Dust.** `makeDust()` is a pool of 400 soft points in the world.
  `opts.dust` makes the wheels throw some, more at speed.

`drive(state, input, def, dt)` is a simple driving model in a flat frame:

- it accelerates at `def.accel` and brakes twice as hard;
- it reverses at 40 % of top speed;
- it turns at `speed / turnRadius`, or on the spot for tracks.

## Notes

- Hull plating uses big panels (150–380 px on 512). A box face maps the
  whole texture, and the first try (30–110 px) read as brick walls.
- Next:
  - put a vehicle into the surface lab instead of the hover craft. Driving
    there is along great circles, and `contact` comes from
    `surf.groundAt` in the vehicle's tangent frame;
  - give the hauler a real load to carry between modules;
  - the sea vehicles lab: done, see [`marine.md`](marine.md).
