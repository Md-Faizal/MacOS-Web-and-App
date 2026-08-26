/**
 * Celestial Cycle Stages Configuration
 */
export const CELESTIAL_STAGES = [
  { 
    name: 'Dawn', 
    start: 5, end: 7, 
    colors: ['#4a5a8a', '#ff9a9e'], 
    sunPos: -90, moonPos: null,
    glow: 0.2,
    type: 'evening'
  },
  { 
    name: 'Morning', 
    start: 7, end: 11, 
    colors: ['#4facfe', '#00f2fe'], 
    sunPos: -45, moonPos: null,
    glow: 0.5,
    type: 'day'
  },
  { 
    name: 'Zenith', 
    start: 11, end: 13, 
    colors: ['#ffffff', '#fff700'], 
    sunPos: 0, moonPos: null,
    glow: 1.0,
    type: 'day'
  },
  { 
    name: 'Afternoon', 
    start: 13, end: 17, 
    colors: ['#f6d365', '#fda085'], 
    sunPos: 45, moonPos: null,
    glow: 0.7,
    type: 'day'
  },
  { 
    name: 'Dusk', 
    start: 17, end: 19, 
    colors: ['#f093fb', '#f5576c'], 
    sunPos: 90, moonPos: 110, // Sun setting, moon rising
    glow: 0.4,
    type: 'evening'
  },
  { 
    name: 'Twilight', 
    start: 19, end: 22, 
    colors: ['#2e3192', '#1bffff'], 
    sunPos: null, moonPos: 135, // Entering from bottom right
    glow: 0.3,
    type: 'night'
  },
  { 
    name: 'Nadir', 
    start: 22, end: 2, 
    colors: ['#090909', '#2d3436'], 
    sunPos: null, moonPos: 180, // Midnight 6 o'clock
    glow: 0.6,
    type: 'night'
  },
  { 
    name: 'Witching Hour', 
    start: 2, end: 5, 
    colors: ['#2c3e50', '#000000'], 
    sunPos: null, moonPos: 225, // Climbing left side
    glow: 0.2,
    type: 'night'
  }
];

export function getCelestialState(now) {
  const hour = now.getHours() + now.getMinutes() / 60;
  
  // Find current and next stage
  let currentIdx = CELESTIAL_STAGES.findIndex(s => {
    if (s.start < s.end) return hour >= s.start && hour < s.end;
    return hour >= s.start || hour < s.end; // Handles overnight Nadir
  });
  
  if (currentIdx === -1) currentIdx = 6; // Default to Nadir if somehow not found

  const stage = CELESTIAL_STAGES[currentIdx];
  const nextStage = CELESTIAL_STAGES[(currentIdx + 1) % CELESTIAL_STAGES.length];
  
  // Calculate Progress
  let progress = 0;
  if (stage.start < stage.end) {
    progress = (hour - stage.start) / (stage.end - stage.start);
  } else {
    // Wrap around for Nadir
    const totalHours = (24 - stage.start) + stage.end;
    const currentProgressHours = hour >= stage.start ? (hour - stage.start) : (24 - stage.start + hour);
    progress = currentProgressHours / totalHours;
  }
  
  return { stage, nextStage, progress };
}

export function lerpColor(color1, color2, factor) {
  const r1 = parseInt(color1.substring(1, 3), 16);
  const g1 = parseInt(color1.substring(3, 5), 16);
  const b1 = parseInt(color1.substring(5, 7), 16);
  
  const r2 = parseInt(color2.substring(1, 3), 16);
  const g2 = parseInt(color2.substring(3, 5), 16);
  const b2 = parseInt(color2.substring(5, 7), 16);
  
  const r = Math.round(r1 + (r2 - r1) * factor);
  const g = Math.round(g1 + (g2 - g1) * factor);
  const b = Math.round(b1 + (b2 - b1) * factor);
  
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
