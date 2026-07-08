// Each activity describes something a person might actually choose to do, and
// how to judge it against a forecast:
//   relevance(ctx) -> base appeal for the day (return 0 to rule it out entirely,
//                     e.g. wrong season or nowhere near warm enough).
//   suits(p, ctx)  -> is a single forecast hour workable? Used to find the best
//                     window of the day and whether it's a "good" day at all.
//   comfort(p, ctx) -> optional 0..1 grade of how *pleasant* a workable hour is,
//                      so a glorious day outranks a merely-passable one. Uses
//                      ctx.band(value, lo, idealLo, idealHi, hi).
//   verdict(ctx)   -> for activities judged on the day as a whole rather than an
//                     hourly window; returns { good, when, quality? }.
// The library is deliberately kept to things worth suggesting — safety callouts
// (heat, cold, UV, storms, wind) live in the Quick Hits tiles instead.
window.WEATHER_ACTIVITIES = [
  {
    id: "walk",
    label: "A run or walk",
    icon: "ph-person-simple-run",
    relevance: () => 2.0,
    suits: (p) => p.precip < 0.1 && p.feelsC >= 2 && p.feelsC <= 27,
    comfort: (p, c) => c.band(p.feelsC, 2, 11, 21, 27) * (1 - 0.25 * (p.wind / 40)),
    bad: "Not today",
    explain: "Dry daylight hours at a comfortable temperature."
  },
  {
    id: "bike",
    label: "A bike ride",
    icon: "ph-bicycle",
    seasons: ["spring", "summer", "fall"],
    relevance: (c) => (c.highC >= 6 && c.highC <= 33 ? 1.8 : 0),
    suits: (p) => p.precip < 0.1 && p.tempC >= 4 && p.tempC <= 33 && p.wind < 35,
    comfort: (p, c) => c.band(p.feelsC, 3, 13, 24, 32) * (1 - 0.4 * (p.wind / 35)),
    bad: "Not today",
    explain: "Headwind matters on a bike, so this leans on calm, dry, comfortable hours."
  },
  {
    id: "hike",
    label: "A hike",
    icon: "ph-mountains",
    relevance: (c) => (c.highC >= 2 && c.highC <= 30 ? 1.7 : 0.4),
    suits: (p) => p.precip < 0.1 && p.feelsC >= 0 && p.feelsC <= 30,
    comfort: (p, c) => c.band(p.feelsC, 0, 8, 20, 28),
    bad: "Not today",
    explain: "Dry hours that are cool enough to climb but not cold enough to bite."
  },
  {
    id: "water",
    label: "A day by the water",
    icon: "ph-waves",
    relevance: (c) => (c.highC >= 22 ? 2.2 : 0),
    suits: (p) => p.precip < 0.1 && p.tempC >= 23 && p.cloud < 70,
    comfort: (p, c) => c.band(p.tempC, 23, 28, 34, 40) * c.band(100 - p.cloud, 25, 55, 100, 100),
    bad: "Not today",
    explain: "It really wants a genuinely hot, bright afternoon — not just a warm one."
  },
  {
    id: "bbq",
    label: "A backyard BBQ",
    icon: "ph-hamburger",
    relevance: (c) => (c.highC >= 16 && c.highC <= 36 ? 1.9 : 0),
    suits: (p) => p.precip < 0.1 && p.tempC >= 15 && p.wind < 30,
    comfort: (p, c) => c.band(p.tempC, 15, 21, 30, 36) * (1 - 0.3 * (p.wind / 30)),
    bad: "Not today",
    explain: "A warm, dry, calm stretch so nobody's shivering or chasing napkins."
  },
  {
    id: "picnic",
    label: "A picnic",
    icon: "ph-basket",
    seasons: ["spring", "summer", "fall"],
    relevance: (c) => (c.highC >= 16 && c.highC <= 32 ? 1.6 : 0),
    suits: (p) => p.precip < 0.05 && p.tempC >= 15 && p.tempC <= 33 && p.wind < 28,
    comfort: (p, c) => c.band(p.tempC, 15, 19, 28, 33) * c.band(100 - p.cloud, 15, 45, 100, 100) * (1 - 0.3 * (p.wind / 28)),
    bad: "Not today",
    explain: "Warm, dry and calm, with some sun on the blanket."
  },
  {
    id: "campfire",
    label: "A backyard campfire",
    icon: "ph-campfire",
    nocturnal: true,
    relevance: (c) => (!c.wetDay && c.lowC >= -2 && c.lowC <= 20 ? 1.7 : 0.3),
    suits: (p) => p.precip < 0.05 && p.wind < 18 && p.tempC <= 20,
    comfort: (p, c) => c.band(p.tempC, -2, 4, 15, 20) * (1 - 0.4 * (p.wind / 18)),
    bad: "Not tonight",
    explain: "A calm, dry, cool evening — crisp enough to want a fire. Check for local fire bans first."
  },
  {
    id: "garden",
    label: "Gardening",
    icon: "ph-flower",
    seasons: ["spring", "summer", "fall"],
    relevance: (c) => (c.highC >= 6 && c.highC <= 30 ? 1.6 : 0),
    suits: (p) => p.precip < 0.1 && p.tempC >= 5 && p.tempC <= 30,
    comfort: (p, c) => c.band(p.tempC, 5, 12, 24, 30),
    bad: "Not today",
    explain: "Mild, dry hours for pottering about in the beds."
  },
  {
    id: "mow",
    label: "Mow the lawn",
    icon: "ph-plant",
    seasons: ["spring", "summer", "fall"],
    relevance: (c) => (c.highC >= 8 && c.highC <= 32 ? 1.4 : 0),
    suits: (p) => p.precip < 0.1 && p.tempC >= 7 && p.tempC <= 32,
    comfort: (p, c) => c.band(p.tempC, 7, 12, 26, 32),
    bad: "Not today",
    explain: "Grass cuts cleanest when it's dry, so this waits for a rain-free stretch."
  },
  {
    id: "laundry",
    label: "Line-dry laundry",
    icon: "ph-t-shirt",
    seasons: ["spring", "summer", "fall"],
    relevance: (c) => (c.highC >= 10 ? 1.3 : 0),
    suits: (p) => p.precip < 0.05 && p.humidity < 75,
    comfort: (p, c) => c.band(100 - p.humidity, 20, 45, 100, 100) * c.band(p.tempC, 8, 16, 32, 40) * (0.7 + 0.3 * Math.min(1, p.wind / 15)),
    bad: "Not today",
    explain: "Low humidity, warmth and a little breeze are what actually dry a wash outside."
  },
  {
    id: "car",
    label: "Wash the car",
    icon: "ph-car-profile",
    relevance: () => 1.2,
    verdict: (c) => (c.rainStart ? { good: false, when: `Rain by ${c.fmtH(c.rainStart)}` } : { good: true, when: "Dry all day", quality: 0.8 }),
    explain: "Only worth it if the forecast stays dry long enough for it to last."
  },
  {
    id: "airout",
    label: "Air out the house",
    icon: "ph-wind",
    relevance: (c) => (!c.wetDay && c.highC >= 12 && c.highC <= 28 ? 1.0 : 0),
    suits: (p) => p.precip < 0.1 && p.tempC >= 11 && p.tempC <= 28 && p.humidity < 72,
    comfort: (p, c) => c.band(p.tempC, 11, 15, 24, 28) * c.band(100 - p.humidity, 25, 45, 100, 100),
    bad: "Not today",
    explain: "Mild, dry, fresh air to move through the house with the windows open."
  },

  // Sport
  {
    id: "teamsports",
    label: "Pickup team sports",
    icon: "ph-soccer-ball",
    relevance: (c) => (c.highC >= 8 && c.highC <= 30 ? 1.4 : 0),
    suits: (p) => p.precip < 0.05 && p.tempC >= 7 && p.tempC <= 30 && p.wind < 30,
    comfort: (p, c) => c.band(p.feelsC, 7, 12, 22, 28) * (1 - 0.25 * (p.wind / 30)),
    bad: "Not today",
    explain: "Dry and mild, with firm footing and no gale to fight."
  },
  {
    id: "yoga",
    label: "Outdoor yoga or tai chi",
    icon: "ph-person-simple-tai-chi",
    relevance: (c) => (c.highC >= 12 && c.highC <= 30 ? 1.1 : 0),
    suits: (p) => p.precip < 0.05 && p.tempC >= 10 && p.tempC <= 30 && p.wind < 15,
    comfort: (p, c) => c.band(p.feelsC, 10, 16, 25, 30) * (1 - 0.5 * (p.wind / 15)),
    bad: "Not today",
    explain: "Calm, mild air that won't chill you mid-stretch or lift your mat."
  },
  {
    id: "paddle",
    label: "Kayaking or paddleboarding",
    icon: "ph-boat",
    seasons: ["spring", "summer", "fall"],
    relevance: (c) => (c.highC >= 14 ? 1.4 : 0),
    suits: (p) => p.wind < 20 && p.precip < 0.1 && p.tempC >= 14,
    comfort: (p, c) => c.band(p.tempC, 14, 20, 30, 38) * (1 - 0.5 * (p.wind / 20)),
    bad: "Not today",
    explain: "Calm water and warm air make paddling easier and a spill less of a shock."
  },
  {
    id: "sailing",
    label: "Sailing or windsurfing",
    icon: "ph-sailboat",
    seasons: ["spring", "summer", "fall"],
    relevance: (c) => (c.highC >= 10 ? 1.3 : 0),
    suits: (p) => p.wind >= 12 && p.wind <= 38 && p.precip < 0.1,
    comfort: (p, c) => c.band(p.wind, 12, 18, 30, 38),
    bad: "Not today",
    explain: "A gentle-to-fresh breeze (Beaufort 3-5, roughly 12-38 km/h) gives power without being overpowered."
  },
  {
    id: "kite",
    label: "Fly a kite",
    icon: "ph-paper-plane-tilt",
    relevance: (c) => (c.highC >= 5 ? 1.1 : 0),
    suits: (p) => p.wind >= 10 && p.wind <= 32 && p.precip < 0.1,
    comfort: (p, c) => c.band(p.wind, 10, 16, 26, 32),
    bad: "Not today",
    explain: "A steady breeze of Beaufort 2-4 (about 10-32 km/h) lifts a kite without tearing at the line."
  },

  // Family and pets
  {
    id: "dogwalk",
    label: "Walk the dog",
    icon: "ph-dog",
    relevance: () => 1.6,
    suits: (p) => p.precip < 0.2 && p.tempC > -12 && p.tempC < 26,
    comfort: (p, c) => c.band(p.tempC, -8, 4, 19, 24),
    bad: "Keep it short today",
    explain: "Kind temperatures for paws and pup — sun-baked pavement above ~25° and hard frost are both rough on their feet."
  },
  {
    id: "playground",
    label: "Playground time",
    icon: "ph-puzzle-piece",
    relevance: (c) => (c.highC >= 10 && c.highC <= 32 ? 1.3 : 0),
    suits: (p) => p.precip < 0.05 && p.tempC >= 8 && p.tempC <= 32 && p.wind < 30,
    comfort: (p, c) => c.band(p.feelsC, 9, 14, 26, 32),
    bad: "Not today",
    explain: "Dry and comfortable for kids to run around outside."
  },
  {
    id: "sprinkler",
    label: "Sprinkler or splash pad",
    icon: "ph-drop",
    seasons: ["summer"],
    relevance: (c) => (c.highC >= 26 ? 1.6 : 0),
    suits: (p) => p.tempC >= 26 && p.precip < 0.1,
    comfort: (p, c) => c.band(p.tempC, 26, 30, 38, 44),
    bad: "Not warm enough",
    explain: "Hot enough that getting soaked feels like relief rather than a chill."
  },

  // Nature and wildlife
  {
    id: "foliage",
    label: "Fall foliage viewing",
    icon: "ph-tree",
    seasons: ["fall"],
    relevance: (c) => (c.lowC <= 12 ? 1.6 : 0.6),
    suits: (p) => p.precip < 0.1 && p.wind < 25,
    comfort: (p, c) => c.band(100 - p.cloud, 15, 45, 100, 100) * (1 - 0.4 * (p.wind / 25)),
    bad: "Not today",
    explain: "Cool nights bring the colour out; wind and rain then strip it fast, so calm, clear days are best (US Forest Service leaf-colour guidance)."
  },
  {
    id: "birdwatch",
    label: "Birdwatching",
    icon: "ph-bird",
    pool: "dawn",
    relevance: () => 1.1,
    suits: (p) => p.precip < 0.1 && p.wind < 20,
    comfort: (p) => 1 - 0.5 * (p.wind / 20),
    bad: "Not this morning",
    explain: "Birds are busiest in the calm hour after sunrise — the dawn chorus — and still air carries their calls further."
  },
  {
    id: "butterfly",
    label: "Butterfly watching",
    icon: "ph-butterfly",
    seasons: ["spring", "summer"],
    relevance: (c) => (c.highC >= 16 ? 1.0 : 0),
    suits: (p) => p.tempC >= 13 && p.wind < 15 && p.precip < 0.05 && p.cloud < 55,
    comfort: (p, c) => c.band(p.tempC, 13, 19, 28, 34) * c.band(100 - p.cloud, 20, 55, 100, 100),
    bad: "Not today",
    explain: "Butterflies need roughly 13°C plus sunshine before they'll fly (Butterfly Conservation flight-threshold guidance)."
  },

  // Light and sky
  {
    id: "stargaze",
    label: "Stargazing",
    icon: "ph-star-four",
    pool: "night",
    relevance: (c) => 1.5 * (c.moonIllum <= 60 ? 1 : 0.6),
    suits: (p) => p.cloud < 35,
    comfort: (p, c) => c.band(100 - p.cloud, 45, 75, 100, 100),
    bad: "Too cloudy",
    explain: "Clear sky under about a third cloud cover, and a dimmer moon, let faint stars stand out."
  },
  {
    id: "goldenhour",
    label: "Golden hour photography",
    icon: "ph-camera",
    pool: "golden",
    relevance: () => 1.2,
    suits: (p) => p.cloud < 65 && p.precip < 0.1,
    comfort: (p, c) => c.band(100 - p.cloud, 25, 45, 95, 100),
    bad: "Clouded out",
    explain: "Low sun sends light through more atmosphere, scattering out the blue and leaving warm tones — as long as cloud isn't blocking the horizon."
  },
  {
    id: "bluehour",
    label: "Blue hour photography",
    icon: "ph-moon-stars",
    pool: "twilight",
    relevance: () => 1.0,
    suits: (p) => p.cloud < 55 && p.precip < 0.1,
    comfort: (p, c) => c.band(100 - p.cloud, 30, 55, 100, 100),
    bad: "Clouded out",
    explain: "Just after sunset the sky is lit only indirectly, giving an even, deep-blue glow."
  },
  {
    id: "fog",
    label: "Foggy morning walk",
    icon: "ph-cloud-fog",
    relevance: () => 0.8,
    suits: (p) => p.visibility != null && p.visibility < 1000,
    bad: "No fog expected",
    explain: "Radiation fog settles on clear, calm nights as the ground cools, dropping visibility below 1 km — the WMO threshold for fog."
  },

  // Winter
  {
    id: "snowplay",
    label: "Sledding or skiing",
    icon: "ph-person-simple-ski",
    relevance: (c) => (c.snowOnGround ? 2.2 : 0),
    suits: (p) => p.tempC <= 2,
    comfort: (p, c) => c.band(p.tempC, -16, -7, 0, 2),
    bad: "Too warm to last",
    explain: "Snow on the ground and air cold enough to keep it firm underfoot."
  },
  {
    id: "snowman",
    label: "Build a snowman",
    icon: "ph-snowflake",
    relevance: (c) => (c.snowOnGround && c.lowC <= 1 ? 1.9 : 0),
    suits: (p) => p.tempC >= -6 && p.tempC <= 1,
    comfort: (p, c) => c.band(p.tempC, -6, -3, 0, 1),
    bad: "Snow too dry to pack",
    explain: "Snow packs best right around freezing; much colder and it's too powdery to stick."
  },
  {
    id: "iceskate",
    label: "Pond ice skating",
    icon: "ph-footprints",
    seasons: ["winter"],
    relevance: (c) => (c.lowC <= -6 ? 1.4 : 0),
    suits: (p) => p.tempC <= -5,
    comfort: (p, c) => c.band(p.tempC, -20, -12, -6, -5),
    bad: "Not cold enough",
    explain: "Clear ice needs several days at or below about -7°C to thicken; always confirm at least 10 cm of solid ice with a local authority first (Red Cross guidance)."
  },
  {
    id: "snowremoval",
    label: "Clear the driveway",
    icon: "ph-shovel",
    seasons: ["winter"],
    relevance: (c) => (c.snowOnGround ? 1.4 : 0),
    suits: (p) => p.snow <= 0.1 && p.tempC <= 2,
    bad: "Still snowing",
    explain: "Best cleared once the snow stops and before it refreezes into ice underfoot."
  },
  {
    id: "leafraking",
    label: "Rake the leaves",
    icon: "ph-leaf",
    seasons: ["fall"],
    relevance: (c) => (c.highC >= 2 && c.highC <= 20 ? 1.1 : 0),
    suits: (p) => p.precip < 0.05 && p.wind < 20,
    comfort: (p, c) => c.band(p.tempC, 2, 8, 18, 24) * (1 - 0.4 * (p.wind / 20)),
    bad: "Not today",
    explain: "Dry leaves rake into piles far more easily than wet ones, and calm air keeps them there."
  },
  {
    id: "frostwalk",
    label: "Frosty morning photography",
    icon: "ph-snowflake",
    seasons: ["fall", "winter", "spring"],
    relevance: (c) => (c.lowC <= 0 ? 0.9 : 0),
    suits: (p) => p.tempC <= 0,
    comfort: (p, c) => c.band(100 - p.cloud, 20, 50, 100, 100),
    bad: "No frost today",
    explain: "Surface frost forms when ground-level air reaches 0°C or below, usually on clear, calm mornings."
  },
  {
    id: "snowyphoto",
    label: "Snowfall photography",
    icon: "ph-camera",
    seasons: ["winter"],
    relevance: () => 1.0,
    suits: (p) => p.snow > 0.1 && p.wind < 20,
    comfort: (p) => 1 - 0.5 * (p.wind / 20),
    bad: "No snow falling",
    explain: "Calm air lets snow drift gently through the frame instead of streaking sideways."
  },

  // Niche hobby
  {
    id: "drone",
    label: "Drone flying",
    icon: "ph-drone",
    relevance: () => 1.0,
    suits: (p) => p.wind < 29 && p.precip < 0.05 && p.visibility != null && p.visibility >= 3000,
    comfort: (p) => (1 - 0.5 * (p.wind / 29)) * (p.cloud < 80 ? 1 : 0.7),
    bad: "Not today",
    explain: "Most consumer drones are rated below about 29 km/h of wind, and flying by sight wants 3 km-plus visibility."
  },

  // Graceful fallback for a washout
  {
    id: "cozy",
    label: "A cozy day in",
    icon: "ph-coffee",
    relevance: (c) => (c.wetDay || c.highC < 3 ? 2.6 : 0.15),
    verdict: (c) => ({ good: true, when: "Anytime", quality: c.wetDay || c.highC < 3 ? 0.85 : 0.2 }),
    explain: "Rises to the top when it's wet or bitterly cold and the outdoor plans are a washout."
  }
];
