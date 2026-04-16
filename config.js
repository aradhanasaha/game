// config.js — edit these to personalize the game

export const CONFIG = {
  // Proposal
  proposal_question: "will you be my girlfriend? 💕",
  yes_message: "i'm so happy!!\nmahi + b2 = <3",

  // Lives
  starting_lives: 5,

  // Level 1 — The Arena
  l1_enemy_attack_interval_min: 50,
  l1_enemy_attack_interval_max: 110,
  l1_player_hp: 100,
  l1_enemy_hp: 100,

  // Level 2 — The Deep
  l2_initial_scroll_speed: 3,
  l2_initial_gap: 160,
  l2_min_gap: 95,
  l2_progress_goal: 400,

  // Level 3 — The Studio
  l3_timer_seconds: 180,
  l3_completion_threshold: 0.70,

  // Level 4 — GURGAON
  l4_player_speed: 5,
  l4_jump_force: -15,
  l4_world_width: 5500,
};

// Color palette
export const PALETTE = {
  pinkDeep:    '#c2185b',
  pinkMid:     '#e91e8c',
  pinkBright:  '#f06292',
  pinkPale:    '#f8bbd0',
  pinkBlush:   '#fce4ec',
  hotMagenta:  '#ff1493',
  coral:       '#ff6b6b',
  cream:       '#fff9f0',
  butter:      '#ffe066',
  mint:        '#a8e6cf',
  skyBlue:     '#87ceeb',
  darkOutline: '#1a0a1a',
  midBrown:    '#8b5e3c',
  tilePink:    '#d81b60',
  tileShadow:  '#880e4f',
  white:       '#ffffff',
};
