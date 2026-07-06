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
  }
];
