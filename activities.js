window.WEATHER_ACTIVITIES = [
  {
    id: "walk",
    label: "A run or walk",
    icon: "ph-person-simple-run",
    relevance: () => 2,
    suits: (p) => p.precip < 0.1 && p.feelsC >= 2 && p.feelsC <= 27,
    bad: "Not today",
    explain: "Dry daylight hours at a comfortable temperature."
  },
  {
    id: "laundry",
    label: "Line-dry laundry",
    icon: "ph-t-shirt",
    seasons: ["spring", "summer", "fall"],
    relevance: (c) => (c.highC >= 10 ? 2 : 0.6),
    suits: (p) => p.precip < 0.05 && p.humidity < 75,
    bad: "Not today",
    explain: "Dry daylight hours with lower humidity, so a wash actually dries outside."
  },
  {
    id: "car",
    label: "Wash the car",
    icon: "ph-car-profile",
    relevance: () => 1.4,
    verdict: (c) => (c.rainStart ? { good: false, when: `Rain by ${c.fmtH(c.rainStart)}` } : { good: true, when: "Dry all day" }),
    explain: "Whether any rain is expected later today."
  },
  {
    id: "mow",
    label: "Mow the lawn",
    icon: "ph-plant",
    seasons: ["spring", "summer", "fall"],
    relevance: (c) => (c.highC >= 8 && c.highC <= 32 ? 1.9 : 0),
    suits: (p) => p.precip < 0.1 && p.tempC >= 7 && p.tempC <= 32,
    bad: "Not today",
    explain: "A dry, mild stretch so the grass is not soaked."
  },
  {
    id: "garden",
    label: "Gardening",
    icon: "ph-flower",
    seasons: ["spring", "summer", "fall"],
    relevance: (c) => (c.highC >= 6 && c.highC <= 30 ? 1.7 : 0),
    suits: (p) => p.precip < 0.1 && p.tempC >= 5 && p.tempC <= 30,
    bad: "Not today",
    explain: "Mild, dry hours during the day."
  },
  {
    id: "bike",
    label: "A bike ride",
    icon: "ph-bicycle",
    seasons: ["spring", "summer", "fall"],
    relevance: (c) => (c.highC >= 6 && c.highC <= 33 ? 1.6 : 0),
    suits: (p) => p.precip < 0.1 && p.tempC >= 4 && p.tempC <= 33 && p.wind < 35,
    bad: "Not today",
    explain: "Dry, not too windy hours at a comfortable temperature."
  },
  {
    id: "hike",
    label: "A hike",
    icon: "ph-mountains",
    relevance: (c) => (c.highC >= 2 && c.highC <= 30 ? 1.3 : 0.4),
    suits: (p) => p.precip < 0.1 && p.feelsC >= 0 && p.feelsC <= 30,
    bad: "Not today",
    explain: "Dry hours that are not too hot or cold."
  },
  {
    id: "bbq",
    label: "A backyard BBQ",
    icon: "ph-hamburger",
    relevance: (c) => (c.highC >= 16 && c.highC <= 36 ? 1.9 : 0),
    suits: (p) => p.precip < 0.1 && p.tempC >= 15 && p.wind < 30,
    bad: "Not today",
    explain: "A warm, dry, calm stretch."
  },
  {
    id: "campfire",
    label: "A backyard campfire",
    icon: "ph-campfire",
    nocturnal: true,
    relevance: (c) => (!c.wetDay && c.lowC >= -2 && c.lowC <= 20 ? 1.7 : 0.3),
    suits: (p) => p.precip < 0.05 && p.wind < 18 && p.tempC <= 20,
    bad: "Not tonight",
    explain: "A calm, dry evening that is cool but not too cold. Check for local fire bans first."
  },
  {
    id: "picnic",
    label: "A picnic",
    icon: "ph-basket",
    seasons: ["spring", "summer", "fall"],
    relevance: (c) => (c.highC >= 16 && c.highC <= 32 ? 1.5 : 0),
    suits: (p) => p.precip < 0.05 && p.tempC >= 15 && p.tempC <= 33 && p.wind < 28,
    bad: "Not today",
    explain: "A warm, dry, calm window during the day."
  },
  {
    id: "water",
    label: "A day by the water",
    icon: "ph-waves",
    relevance: (c) => (c.highC >= 24 ? 2.2 : 0),
    suits: (p) => p.precip < 0.1 && p.tempC >= 23 && p.cloud < 65,
    bad: "Not today",
    explain: "Hot, bright, dry hours."
  },
  {
    id: "airout",
    label: "Air out the house",
    icon: "ph-wind",
    relevance: (c) => (!c.wetDay && c.highC >= 12 && c.highC <= 28 ? 1.1 : 0),
    suits: (p) => p.precip < 0.1 && p.tempC >= 11 && p.tempC <= 28 && p.humidity < 72,
    bad: "Not today",
    explain: "Mild, dry, fresh hours to open the windows."
  },
  {
    id: "snowplay",
    label: "Sledding or skiing",
    icon: "ph-person-simple-ski",
    relevance: (c) => (c.snowOnGround ? 2.4 : 0),
    suits: (p) => p.tempC <= 2,
    bad: "Too warm to last",
    explain: "Snow on the ground and cold enough air for it to last."
  },
  {
    id: "snowman",
    label: "Build a snowman",
    icon: "ph-snowflake",
    relevance: (c) => (c.snowOnGround && c.lowC <= 1 ? 2.0 : 0),
    suits: (p) => p.tempC >= -6 && p.tempC <= 1,
    bad: "Snow too dry",
    explain: "Snow on the ground near the freezing mark for packing."
  },
  {
    id: "cozy",
    label: "A cozy day in",
    icon: "ph-coffee",
    relevance: (c) => (c.wetDay || c.highC < 3 ? 2.6 : 0.15),
    verdict: () => ({ good: true, when: "Anytime" }),
    explain: "Turns up when it is wet or bitterly cold and outdoor plans are a washout."
  },

  // Light and sky
  {
    id: "goldenhour",
    label: "Golden hour photography",
    icon: "ph-camera",
    pool: "golden",
    relevance: () => 1.3,
    suits: (p) => p.cloud < 60 && p.precip < 0.1,
    bad: "Clouded out",
    explain: "When the sun sits low near the horizon its light passes through more atmosphere, scattering away blue light and leaving warm, soft tones (Rayleigh scattering) — as long as clouds aren't blocking the view."
  },
  {
    id: "bluehour",
    label: "Blue hour photography",
    icon: "ph-moon-stars",
    pool: "twilight",
    relevance: () => 1.0,
    suits: (p) => p.cloud < 50 && p.precip < 0.1,
    bad: "Clouded out",
    explain: "In the short window after sunset or before sunrise, the sun sits just below the horizon and lights the sky only indirectly, producing an even, deep-blue glow."
  },
  {
    id: "stargaze",
    label: "Stargazing",
    icon: "ph-star-four",
    pool: "night",
    relevance: (c) => (c.moonIllum <= 60 ? 1.6 : 0.7),
    suits: (p) => p.cloud < 30,
    bad: "Too cloudy",
    explain: "Clear sky, under about 30% cloud cover, and a dimmer moon let faint stars stand out against a darker sky."
  },
  {
    id: "rainbow",
    label: "Rainbow watching",
    icon: "ph-rainbow",
    relevance: (c) => (c.wetDay ? 1.2 : 0.3),
    suits: (p) => p.precip > 0 && p.precip < 4 && p.cloud < 75,
    bad: "Not likely today",
    explain: "Rainbows need sunshine and rain at the same time with the sun low and behind you, so scattered showers with some clear sky give the best odds."
  },
  {
    id: "fog",
    label: "Foggy morning walk",
    icon: "ph-cloud-fog",
    relevance: () => 0.9,
    suits: (p) => p.visibility != null && p.visibility < 1000,
    bad: "No fog expected",
    explain: "Radiation fog forms on clear, calm nights as the ground cools, dropping visibility below 1 km — the World Meteorological Organization's threshold for fog."
  },
  {
    id: "frostwalk",
    label: "Frosty morning photography",
    icon: "ph-snowflake",
    seasons: ["fall", "winter", "spring"],
    relevance: (c) => (c.lowC <= 0 ? 1.1 : 0),
    suits: (p) => p.tempC <= 0,
    bad: "No frost today",
    explain: "Surface frost forms once the air right at ground level drops to 0°C or below, usually on clear, calm mornings that favor rapid overnight cooling."
  },

  // Health and safety
  {
    id: "heatsafety",
    label: "Stay cool indoors",
    icon: "ph-fan",
    relevance: (c) => (c.highC >= 32 ? 1.8 : 0),
    suits: (p) => p.feelsC >= 39,
    bad: "No extreme heat today",
    explain: "A heat index of 39°C (102°F) or higher is the National Weather Service's 'Danger' category, where heat cramps and heat exhaustion are likely and heatstroke is possible with continued exposure."
  },
  {
    id: "coldsafety",
    label: "Bundle up or stay in",
    icon: "ph-thermometer-cold",
    seasons: ["fall", "winter", "spring"],
    relevance: (c) => (c.lowC <= -15 ? 1.8 : 0),
    suits: (p) => p.feelsC <= -28,
    bad: "No extreme cold today",
    explain: "Environment Canada's wind chill index puts frostbite on exposed skin within about 30 minutes once wind chill drops to -28°C."
  },
  {
    id: "sunprotect",
    label: "High UV — cover up",
    icon: "ph-sunglasses",
    relevance: (c) => (c.uvMax >= 6 ? 1.4 + (c.uvMax - 6) * 0.1 : 0),
    verdict: (c) => ({ good: true, when: c.uvMax >= 8 ? `UV index ${Math.round(c.uvMax)} — very high` : `UV index ${Math.round(c.uvMax)} — high` }),
    explain: "At a UV Index of 6 or higher on the WHO/EPA scale, unprotected skin can burn in well under 30 minutes at midday, so a hat, sunscreen and shade are worth planning around."
  },
  {
    id: "airquality",
    label: "Outdoor exercise air check",
    icon: "ph-gauge",
    relevance: (c) => (c.aqi != null ? 1.2 : 0),
    verdict: (c) => (c.aqi <= 100 ? { good: true, when: "Good air today" } : { good: false, when: "Unhealthy air — limit exertion" }),
    explain: "The EPA Air Quality Index rates 0-50 as Good and 51-100 as Moderate; above 100, sensitive groups and eventually everyone can feel effects during hard outdoor exercise."
  },

  // Wind and water sports
  {
    id: "kite",
    label: "Fly a kite",
    icon: "ph-paper-plane-tilt",
    relevance: (c) => (c.highC >= 5 ? 1.2 : 0),
    suits: (p) => p.wind >= 10 && p.wind <= 32 && p.precip < 0.1,
    bad: "Not today",
    explain: "A gentle-to-moderate breeze, Beaufort force 2-4 or about 10-32 km/h, is the range kite-flying guides recommend for steady lift without fighting the line."
  },
  {
    id: "sailing",
    label: "Sailing or windsurfing",
    icon: "ph-sailboat",
    seasons: ["spring", "summer", "fall"],
    relevance: (c) => (c.highC >= 10 ? 1.3 : 0),
    suits: (p) => p.wind >= 12 && p.wind <= 38 && p.precip < 0.1,
    bad: "Not today",
    explain: "Beaufort force 3-5, a gentle to fresh breeze around 12-38 km/h, gives enough power to sail without overpowering typical recreational boats."
  },
  {
    id: "paddle",
    label: "Kayaking or paddleboarding",
    icon: "ph-boat",
    seasons: ["spring", "summer", "fall"],
    relevance: (c) => (c.highC >= 12 ? 1.3 : 0),
    suits: (p) => p.wind < 20 && p.precip < 0.1 && p.tempC >= 14,
    bad: "Not today",
    explain: "Calmer water, under about 20 km/h of wind, and mild air make it easier to paddle and less risky if you end up in the water."
  },
  {
    id: "iceskate",
    label: "Pond ice skating",
    icon: "ph-footprints",
    seasons: ["winter"],
    relevance: (c) => (c.lowC <= -7 ? 1.4 : 0),
    suits: (p) => p.tempC <= -5,
    bad: "Not cold enough",
    explain: "Clear ice typically needs several straight days at or below about -7°C to thicken enough to bear weight; always verify at least 10 cm (4 in) of clear ice with a local authority before heading out (Red Cross safety guidance)."
  },

  // Nature and wildlife
  {
    id: "birdwatch",
    label: "Birdwatching",
    icon: "ph-bird",
    pool: "dawn",
    relevance: () => 1.1,
    suits: (p) => p.precip < 0.1 && p.wind < 20,
    bad: "Not this morning",
    explain: "Birds are most vocal and active just after sunrise, the 'dawn chorus', and calm, dry air carries their calls further and makes foraging easier."
  },
  {
    id: "butterfly",
    label: "Butterfly watching",
    icon: "ph-butterfly",
    seasons: ["spring", "summer"],
    relevance: (c) => (c.highC >= 18 ? 1.2 : 0),
    suits: (p) => p.tempC >= 13 && p.wind < 15 && p.precip < 0.05 && p.cloud < 50,
    bad: "Not today",
    explain: "Butterflies are cold-blooded fliers that generally need air temperatures above about 13°C, plus sun and calm air, before they'll take wing (Butterfly Conservation flight-threshold guidance)."
  },
  {
    id: "foliage",
    label: "Fall foliage viewing",
    icon: "ph-tree",
    seasons: ["fall"],
    relevance: (c) => (c.lowC <= 10 && c.lowC >= -2 ? 1.5 : 0.5),
    suits: (p) => p.precip < 0.1 && p.wind < 25,
    bad: "Not today",
    explain: "Bright days and cool but not freezing nights bring out the reds and oranges in leaves, but wind and rain strip the color off trees quickly once it turns (US Forest Service leaf-color guidance)."
  },

  // Family and pets
  {
    id: "dogwalk",
    label: "Dog walk — paw-safe hours",
    icon: "ph-dog",
    relevance: (c) => (c.highC >= 25 || c.lowC <= -10 ? 1.5 : 0.4),
    suits: (p) => p.tempC < 25 && p.tempC > -15,
    bad: "Stick to grass, or skip it",
    explain: "Pavement can run 11-22°C hotter than the air in direct sun, so vets advise cooler hours once air temp passes about 25°C; paws are also at frostbite risk in prolonged extreme cold (AVMA guidance)."
  },
  {
    id: "playground",
    label: "Playground time",
    icon: "ph-puzzle-piece",
    relevance: (c) => (c.highC >= 10 && c.highC <= 32 ? 1.2 : 0),
    suits: (p) => p.precip < 0.05 && p.tempC >= 8 && p.tempC <= 32 && p.wind < 30,
    bad: "Not today",
    explain: "Dry, mild, and not too breezy — comfortable conditions for kids to be outside."
  },
  {
    id: "sprinkler",
    label: "Sprinkler or splash pad",
    icon: "ph-drop",
    seasons: ["summer"],
    relevance: (c) => (c.highC >= 27 ? 1.6 : 0),
    suits: (p) => p.tempC >= 26 && p.precip < 0.1,
    bad: "Not today",
    explain: "Warm enough that evaporative cooling from water play feels refreshing instead of chilly."
  },

  // Chores and yard work
  {
    id: "leafraking",
    label: "Rake the leaves",
    icon: "ph-leaf",
    seasons: ["fall"],
    relevance: (c) => (c.highC >= 2 && c.highC <= 20 ? 1.3 : 0),
    suits: (p) => p.precip < 0.05 && p.wind < 20,
    bad: "Not today",
    explain: "Dry leaves rake into piles far more easily than wet ones, and calm air keeps the piles where you put them."
  },
  {
    id: "snowremoval",
    label: "Clear the driveway",
    icon: "ph-shovel",
    seasons: ["winter"],
    relevance: (c) => (c.snowOnGround ? 1.8 : 0),
    suits: (p) => p.snow <= 0.1 && p.tempC <= 2,
    bad: "Still snowing",
    explain: "Clearing snow once it stops falling, and before a refreeze compacts it into ice, is standard winter-safety advice for keeping walkways passable."
  },

  // Weather to work around
  {
    id: "thunderindoor",
    label: "Storm-safe indoor time",
    icon: "ph-cloud-lightning",
    relevance: (c) => (c.capeMax >= 1000 ? 1.7 : 0),
    verdict: (c) => ({ good: true, when: c.capeMax >= 2500 ? "High storm potential" : "Storm potential today" }),
    explain: "CAPE, Convective Available Potential Energy, above 1000 J/kg signals enough atmospheric instability for thunderstorms to develop (NOAA Storm Prediction Center thresholds) — a good day to keep plans flexible."
  },
  {
    id: "windysecure",
    label: "Secure loose outdoor items",
    icon: "ph-wind",
    relevance: (c) => (c.gustMax >= 50 ? 1.5 : 0),
    verdict: (c) => ({ good: true, when: c.gustMax >= 62 ? "Gale-force gusts possible" : "Strong gusts possible" }),
    explain: "At Beaufort force 7, 50-61 km/h, whole trees sway and walking into the wind gets hard — patio furniture, trampolines and bins are worth tying down or storing."
  },
  {
    id: "snowyphoto",
    label: "Snowfall photography",
    icon: "ph-camera",
    seasons: ["winter"],
    relevance: () => 1.0,
    suits: (p) => p.snow > 0.1 && p.wind < 20,
    bad: "No snow falling",
    explain: "Calmer wind keeps falling snow drifting gently through the frame instead of streaking sideways or washing out the shot."
  },

  // More sport and activity
  {
    id: "teamsports",
    label: "Pickup team sports",
    icon: "ph-soccer-ball",
    relevance: (c) => (c.highC >= 8 && c.highC <= 30 ? 1.3 : 0),
    suits: (p) => p.precip < 0.05 && p.tempC >= 7 && p.tempC <= 30 && p.wind < 30,
    bad: "Not today",
    explain: "Dry, mild, and not too windy — good footing and fair conditions for a pickup game."
  },
  {
    id: "yoga",
    label: "Outdoor yoga or tai chi",
    icon: "ph-person-simple-tai-chi",
    relevance: (c) => (c.highC >= 12 && c.highC <= 30 ? 1.1 : 0),
    suits: (p) => p.precip < 0.05 && p.tempC >= 10 && p.tempC <= 30 && p.wind < 15,
    bad: "Not today",
    explain: "Calm, mild air that won't chill you mid-stretch or send your mat tumbling."
  },
  {
    id: "drone",
    label: "Drone flying",
    icon: "ph-drone",
    relevance: () => 1.1,
    suits: (p) => p.wind < 29 && p.precip < 0.05 && p.visibility != null && p.visibility >= 3000,
    bad: "Not today",
    explain: "Most consumer drones are rated for a safe margin under about 29 km/h of wind, and flying by line of sight calls for at least 3 km of visibility, similar to the minimum used in aviation visual-flight rules."
  }
];
